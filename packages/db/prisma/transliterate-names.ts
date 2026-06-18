/**
 * Fills players.name_ar for every player that currently has it null, by asking
 * Claude to TRANSLITERATE each name into Arabic *by how it sounds* — never by
 * translating the meaning of the words. This is a STANDALONE, re-runnable data
 * tool: it touches ONLY the players.name_ar column and no game logic, engine,
 * or rank rules (ranks key on nationality/position/clubs, never the name).
 *
 *   pnpm db:transliterate-names                       # real run, all null rows
 *   pnpm db:transliterate-names --dry-run             # call Claude, print, NO writes
 *   pnpm db:transliterate-names --dry-run --sample=10 # cheap quality preview
 *   pnpm db:transliterate-names --sample=200          # cap rows (testing)
 *   pnpm db:transliterate-names --batch=50            # rows per Claude request
 *
 * Idempotent: only rows WHERE name_ar IS NULL are selected, so completed players
 * are skipped on re-run and a crash mid-way loses nothing. Each batch is written
 * as it completes. Auth: reads ANTHROPIC_API_KEY from the environment
 * (packages/db/.env); never hardcoded or committed.
 */
import "./_ensure-system-ca";
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../src/client";

// --- args -----------------------------------------------------------------

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const SAMPLE = numArg("--sample"); // undefined = all
const BATCH_SIZE = numArg("--batch") ?? 50;
const MODEL = "claude-opus-4-8";

function numArg(flag: string): number | undefined {
  const hit = argv.find((a) => a.startsWith(`${flag}=`));
  if (!hit) return undefined;
  const n = Number(hit.slice(flag.length + 1));
  if (!Number.isFinite(n) || n <= 0) throw new Error(`invalid ${flag} value`);
  return Math.floor(n);
}

// --- transliteration policy (system prompt) -------------------------------

const SYSTEM_PROMPT = `أنت خبير في كتابة أسماء لاعبي كرة القدم بالعربية كما تُنطق في الإعلام الرياضي العربي (مثل تعليق بي إن سبورت).

مهمتك: تحويل كل اسم إنجليزي إلى العربية بـ "النقل الصوتي" — أي كتابة الاسم كما يُسمع/يُنطق، وليس ترجمة معنى الكلمات.

القواعد الإلزامية:
1) انقل الصوت لا المعنى. أمثلة: "Kevin De Bruyne" → "كيفن دي بروين" (وليس "كيفن من برويني"). "Vinícius Júnior" → "فينيسيوس جونيور" (وليس "فينيسيوس الأصغر" — لا تترجم Junior إلى الأصغر). لا تترجم أي كلمة إلى معناها أبداً.
2) الأسماء العربية الأصل (لاعبون من دول عربية): اكتبها بإملائها العربي الصحيح. "Mohamed Salah" → "محمد صلاح"، "Achraf Hakimi" → "أشرف حكيمي".
3) اللاعبون المشهورون الذين لهم اسم عربي متعارف عليه في الإعلام الرياضي: استخدم الاسم المتعارف عليه. "Kylian Mbappé" → "كيليان مبابي"، "Erling Haaland" → "إيرلينج هولاند".
4) كثير من الأسماء مخزّنة بصيغة "حرف أول + اسم العائلة" مثل "K. De Bruyne" أو "A. Broja". القاعدة:
   - إذا كنت واثقاً من هوية اللاعب (لاعب معروف)، وسّع الحرف الأول إلى الاسم الكامل المتعارف عليه: "K. De Bruyne" → "كيفن دي بروين"، "A. Hakimi" → "أشرف حكيمي".
   - إذا لم تكن واثقاً من الاسم الأول، انقل اسم العائلة فقط واحذف الحرف الأول المجرد: "A. Mandi" → "ماندي". لا تخترع اسماً أول أبداً.
5) اترك الحقل سلسلة فارغة "" فقط إذا كان الاسم غير قابل للنطق إطلاقاً أو لا مقابل صوتي له — وهذا نادر جداً.

ستتلقى قائمة مرقّمة من الأسماء مع جنسية كل لاعب (الجنسية للمساعدة على تمييز اللاعب فقط — لا تكتبها في الناتج). أعد لكل رقم نقله الصوتي العربي.`;

const OUTPUT_FORMAT = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            n: { type: "integer" },
            name_ar: { type: "string" },
          },
          required: ["n", "name_ar"],
          additionalProperties: false,
        },
      },
    },
    required: ["results"],
    additionalProperties: false,
  },
};

// --- core -----------------------------------------------------------------

type Row = { id: string; name: string; nationality: string };

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

async function transliterateBatch(rows: Row[]): Promise<Map<number, string>> {
  const list = rows
    .map((r, i) => `${i + 1}. ${r.name} (${r.nationality})`)
    .join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    output_config: { format: OUTPUT_FORMAT },
    messages: [{ role: "user", content: list }],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("no text block in response");
  const parsed = JSON.parse(text.text) as { results: { n: number; name_ar: string }[] };

  const out = new Map<number, string>();
  for (const r of parsed.results) out.set(r.n, (r.name_ar ?? "").trim());
  return out;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set (add it to packages/db/.env)");
  }

  const rows: Row[] = (
    await prisma.player.findMany({
      where: { nameAr: null },
      select: { id: true, name: true, nationality: { select: { name: true } } },
      orderBy: { name: "asc" },
      ...(SAMPLE ? { take: SAMPLE } : {}),
    })
  ).map((p) => ({ id: p.id, name: p.name, nationality: p.nationality.name }));

  console.log(
    `Transliterate names → Arabic [model=${MODEL}]` +
      `${DRY_RUN ? " [DRY RUN: no writes]" : ""}` +
      `${SAMPLE ? ` [sample=${SAMPLE}]` : ""} [batch=${BATCH_SIZE}]`,
  );
  console.log(`players needing name_ar: ${rows.length}`);
  if (rows.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  const batches = chunk(rows, BATCH_SIZE);
  let written = 0;
  let blank = 0;
  let failedBatches = 0;

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    try {
      const result = await transliterateBatch(batch);

      for (let i = 0; i < batch.length; i++) {
        const row = batch[i];
        const nameAr = result.get(i + 1) ?? "";

        if (DRY_RUN) {
          console.log(`  ${row.name}  →  ${nameAr || "(left null)"}`);
          continue;
        }
        if (!nameAr) {
          blank++;
          continue; // leave name_ar null
        }
        await prisma.player.update({ where: { id: row.id }, data: { nameAr } });
        written++;
      }
      if (!DRY_RUN) {
        console.log(
          `  batch ${b + 1}/${batches.length}: written ${written}, left-null ${blank}`,
        );
      }
    } catch (err) {
      failedBatches++;
      console.error(
        `  batch ${b + 1}/${batches.length} FAILED (players keep null, re-run to retry): ${
          (err as Error).message
        }`,
      );
    }
  }

  console.log("\n==== SUMMARY ====");
  if (DRY_RUN) {
    console.log(`previewed           : ${rows.length}`);
    console.log("DRY RUN — no database writes were performed.");
  } else {
    console.log(`name_ar written     : ${written}`);
    console.log(`left null (blank)   : ${blank}`);
    console.log(`failed batches      : ${failedBatches}`);
    console.log("✅ Transliteration complete.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
