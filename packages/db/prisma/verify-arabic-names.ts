/**
 * INDEPENDENT verifier pass — gate 2 of the strict Arabic-names policy. Every
 * LLM-generated (verified=false, name_ar set) pair is judged by a SEPARATE
 * Claude call: does this Arabic string denote this exact entity as Arabic
 * sports media would name it? Failures are REJECTED (name_ar → NULL, falling
 * back to English); passes stay verified=false awaiting the owner's publish.
 *
 *   pnpm --filter @fb/db verify:arabic-names            # verify all pending
 *   pnpm --filter @fb/db verify:arabic-names --sample=50
 *
 * After this completes: pnpm --filter @fb/db audit:arabic-names (owner review)
 * then publish:arabic-names --confirm (gate 3).
 */
import "./_ensure-system-ca";
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../src/client";
import { Prisma } from "../src/generated/client";

const argv = process.argv.slice(2);
const SAMPLE = numArg("--sample");
const BATCH_SIZE = numArg("--batch") ?? 50;
const MODEL = "claude-opus-4-8";

function numArg(flag: string): number | undefined {
  const hit = argv.find((a) => a.startsWith(`${flag}=`));
  if (!hit) return undefined;
  const n = Number(hit.slice(flag.length + 1));
  if (!Number.isFinite(n) || n <= 0) throw new Error(`invalid ${flag} value`);
  return Math.floor(n);
}

const SYSTEM_PROMPT = `أنت مدقق لغوي رياضي. ستتلقى أزواجًا مرقّمة: اسم إنجليزي لكيان كروي (نادٍ أو بطولة) والاسم العربي المقترح له.

مهمتك لكل زوج: هل الاسم العربي يدل على نفس الكيان تمامًا كما يسميه الإعلام الرياضي العربي، دون خلط مع كيان آخر ودون ترجمة معنى خاطئة؟

- ok=true فقط إذا كان الاسم العربي صحيحًا ومقبولًا إعلاميًا (اختلافات إملائية بسيطة مقبولة: غ/ج، ه/ة).
- ok=false إذا كان يشير إلى كيان مختلف، أو ترجمة حرفية خاطئة لاسم علم، أو نصه ليس عربيًا، أو مختلَقًا.
كن متشددًا: عند الشك أعد ok=false.`;

const OUTPUT_FORMAT = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: { n: { type: "integer" }, ok: { type: "boolean" } },
          required: ["n", "ok"],
          additionalProperties: false,
        },
      },
    },
    required: ["results"],
    additionalProperties: false,
  },
};

const client = new Anthropic();

interface Pending {
  kind: "club" | "competition" | "trophy";
  key: string; // club id / league_id / trophy id
  en: string;
  ar: string;
}

async function verifyBatch(items: Pending[]): Promise<Map<number, boolean>> {
  const list = items.map((r, i) => `${i + 1}. ${r.en}  ⇐  ${r.ar}`).join("\n");
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    output_config: { format: OUTPUT_FORMAT },
    messages: [{ role: "user", content: list }],
  });
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("no text block in response");
  const parsed = JSON.parse(text.text) as { results: { n: number; ok: boolean }[] };
  const out = new Map<number, boolean>();
  for (const r of parsed.results) out.set(r.n, r.ok === true);
  return out;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

async function reject(p: Pending): Promise<void> {
  if (p.kind === "club") {
    await prisma.club.update({ where: { id: p.key }, data: { nameAr: null } });
  } else if (p.kind === "competition") {
    await prisma.competitionNameAr.delete({ where: { leagueId: Number(p.key) } });
  } else {
    await prisma.gpAskableTrophy.update({ where: { id: p.key }, data: { nameAr: null } });
  }
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set (add it to packages/db/.env)");
  }
  const clubs = await prisma.club.findMany({
    where: { kind: "CLUB", nameAr: { not: null }, nameArVerified: false },
    select: { id: true, name: true, nameAr: true },
  });
  const comps = await prisma.$queryRaw<{ league_id: number; comp_name: string; name_ar: string }[]>(Prisma.sql`
    SELECT a.league_id, d.comp_name, a.name_ar
    FROM football.competition_names_ar a
    JOIN football.competition_dim d ON d.league_id = a.league_id
    WHERE a.verified = false
  `);
  const trophies = await prisma.gpAskableTrophy.findMany({
    where: { nameAr: { not: null }, nameArVerified: false },
    select: { id: true, compName: true, country: true, nameAr: true },
  });

  let pending: Pending[] = [
    ...clubs.map((c): Pending => ({ kind: "club", key: c.id, en: c.name, ar: c.nameAr! })),
    ...comps.map((c): Pending => ({ kind: "competition", key: String(c.league_id), en: c.comp_name, ar: c.name_ar })),
    ...trophies.map((t): Pending => ({ kind: "trophy", key: t.id, en: `${t.compName}${t.country ? ` (${t.country})` : ""}`, ar: t.nameAr! })),
  ];
  if (SAMPLE) pending = pending.slice(0, SAMPLE);
  console.log(
    `Verify Arabic names [model=${MODEL}] — pending: clubs=${clubs.length} competitions=${comps.length} trophies=${trophies.length}`,
  );
  if (pending.length === 0) {
    console.log("Nothing to verify.");
    return;
  }

  let passed = 0;
  let rejected = 0;
  for (const [b, batch] of chunk(pending, BATCH_SIZE).entries()) {
    try {
      const res = await verifyBatch(batch);
      for (let i = 0; i < batch.length; i++) {
        const ok = res.get(i + 1);
        if (ok === true) passed++;
        else {
          console.log(`  REJECT [${batch[i]!.kind}] ${batch[i]!.en} ⇐ ${batch[i]!.ar}`);
          await reject(batch[i]!);
          rejected++;
        }
      }
      console.log(`[verify] batch ${b + 1}/${Math.ceil(pending.length / BATCH_SIZE)} (passed=${passed} rejected=${rejected})`);
    } catch (e) {
      console.error(`[verify] batch ${b + 1} FAILED (left pending):`, (e as Error).message);
    }
  }
  console.log(
    `VERIFY COMPLETE — passed=${passed} rejected=${rejected}. Passed rows remain UNPUBLISHED (verified=false).`,
  );
  console.log("Next: pnpm --filter @fb/db audit:arabic-names → owner review → publish:arabic-names --confirm");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
