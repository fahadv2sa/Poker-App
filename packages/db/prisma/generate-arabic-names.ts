/**
 * LLM tier of the Arabic-first names plan (approved 2026-07-06): fills
 * name_ar for CLUBS (transliteration) and COMPETITIONS + TROPHIES (media
 * translation) wherever it is still NULL — the curated seed
 * (seed-arabic-names.ts) has already covered the majors and is never touched.
 *
 * STRICT policy: everything written here stays verified=false — invisible to
 * search/display — until it passes verify-arabic-names.ts AND the owner
 * publishes (publish-arabic-names.ts --confirm).
 *
 *   pnpm --filter @fb/db generate:arabic-names                 # all kinds
 *   pnpm --filter @fb/db generate:arabic-names --kind=clubs
 *   pnpm --filter @fb/db generate:arabic-names --dry-run --sample=20
 *
 * Idempotent: only NULL rows are selected; clubs are processed in USAGE order
 * so the most-encountered names complete first. Mirrors transliterate-names.ts.
 */
import "./_ensure-system-ca";
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../src/client";
import { Prisma } from "../src/generated/client";
import { gpCountryLikeClubNames } from "../src/gp-facts";

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const KIND = (argv.find((a) => a.startsWith("--kind="))?.slice(7) ?? "all") as
  | "clubs"
  | "competitions"
  | "all";
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

const CLUB_SYSTEM_PROMPT = `أنت خبير في كتابة أسماء أندية كرة القدم بالعربية كما تُكتب في الإعلام الرياضي العربي (مثل بي إن سبورت وكووورة).

مهمتك: تحويل كل اسم نادٍ إنجليزي إلى العربية بالنقل الصوتي — كما يُنطق، وليس ترجمة معنى الكلمات.

القواعد الإلزامية:
1) انقل الصوت لا المعنى: "Crystal Palace" → "كريستال بالاس" (وليس "القصر البلوري").
2) الأندية المشهورة التي لها اسم عربي متعارف عليه في الإعلام: استخدمه ("Bayern München" → "بايرن ميونخ"، "Sporting CP" → "سبورتينغ لشبونة").
3) البادئات واللواحق الإدارية العامة مثل FC, CF, SV, VfB, AS, AC, SC, CD, UD, 1. تُحذف عادة إلا إذا كانت جزءًا من الاسم المتداول ("AC Milan" → "ميلان"، لكن "FC Porto" → "بورتو").
4) أندية الدول العربية: اكتبها بإملائها العربي الصحيح ("Al-Hilal Saudi FC" → "الهلال السعودي"، "Zamalek SC" → "الزمالك").
5) لا تخترع اسمًا أبدًا. إذا كان الاسم غير قابل للنقل إطلاقًا، أعد سلسلة فارغة "" (نادر جدًا).

ستتلقى قائمة مرقّمة من أسماء الأندية (مع بلد النادي للمساعدة على التمييز فقط — لا تكتبه في الناتج). أعد لكل رقم الاسم العربي.`;

const COMP_SYSTEM_PROMPT = `أنت خبير في أسماء بطولات كرة القدم كما تُستخدم في الإعلام الرياضي العربي (بي إن سبورت، كووورة، العربية).

مهمتك: إعطاء الاسم العربي المتداول إعلاميًا لكل بطولة/لقب. هنا الترجمة الإعلامية هي الصواب (وليس النقل الصوتي): "La Liga" → "الدوري الإسباني"، "Eredivisie" → "الدوري الهولندي"، "Copa Libertadores" → "كأس ليبرتادوريس".

القواعد الإلزامية:
1) استخدم الاسم الإعلامي العربي المتداول. الدوريات المحلية: "الدوري + نسبة البلد" ("Allsvenskan" السويد → "الدوري السويدي").
2) الكؤوس المحلية: "كأس + البلد" أو الاسم المتداول ("Copa del Rey" → "كأس ملك إسبانيا").
3) تصفيات كأس العالم وأمم القارات: "تصفيات كأس العالم — أوروبا" ونحوها.
4) درجات أدنى: أضف "الدرجة الثانية/الثالثة" ("Serie C" إيطاليا → "الدوري الإيطالي الدرجة الثالثة").
5) لا تخترع اسمًا. إذا لم يكن للبطولة مقابل عربي معقول، أعد "" (نادر).

ستتلقى قائمة مرقّمة: اسم البطولة (وبلدها إن وُجد — للمساعدة فقط). أعد لكل رقم الاسم العربي.`;

const OUTPUT_FORMAT = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: { n: { type: "integer" }, name_ar: { type: "string" } },
          required: ["n", "name_ar"],
          additionalProperties: false,
        },
      },
    },
    required: ["results"],
    additionalProperties: false,
  },
};

const client = new Anthropic();

async function nameBatch(
  system: string,
  items: { label: string }[],
): Promise<Map<number, string>> {
  const list = items.map((r, i) => `${i + 1}. ${r.label}`).join("\n");
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system,
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

const hasArabic = (s: string) => /[؀-ۿ]/.test(s);

async function generateClubs(): Promise<void> {
  const pseudo = (await gpCountryLikeClubNames()).map((n) => n.toLowerCase());
  const pseudoFilter =
    pseudo.length > 0 ? Prisma.sql`AND lower(c.name) NOT IN (${Prisma.join(pseudo)})` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ id: string; name: string; country: string | null }[]>(Prisma.sql`
    SELECT c.id, c.name, n.name AS country
    FROM football.clubs c
    LEFT JOIN football.nationalities n ON n.id = c.country_id
    WHERE c.kind = 'CLUB' AND c.name_ar IS NULL ${pseudoFilter}
    ORDER BY (SELECT count(*) FROM football.player_team_seasons ts WHERE lower(ts.team_name) = lower(c.name)) DESC
    ${SAMPLE ? Prisma.sql`LIMIT ${SAMPLE}` : Prisma.empty}
  `);
  console.log(`clubs needing name_ar: ${rows.length}`);
  let written = 0;
  for (const [b, batch] of chunk(rows, BATCH_SIZE).entries()) {
    try {
      const res = await nameBatch(
        CLUB_SYSTEM_PROMPT,
        batch.map((r) => ({ label: `${r.name}${r.country ? ` (${r.country})` : ""}` })),
      );
      for (let i = 0; i < batch.length; i++) {
        const ar = res.get(i + 1);
        if (!ar || !hasArabic(ar)) continue;
        if (DRY_RUN) console.log(`  ${batch[i]!.name} → ${ar}`);
        else {
          await prisma.club.update({ where: { id: batch[i]!.id }, data: { nameAr: ar, nameArVerified: false } });
          written++;
        }
      }
      console.log(`[clubs] batch ${b + 1} done (written=${written})`);
    } catch (e) {
      console.error(`[clubs] batch ${b + 1} FAILED (skipped):`, (e as Error).message);
    }
  }
}

async function generateCompetitions(): Promise<void> {
  // One run covers BOTH competition_dim entries and trophy-whitelist rows,
  // deduplicated on (name, country) so the same competition gets ONE Arabic
  // string everywhere (glossary consistency).
  const dim = await prisma.$queryRaw<{ league_id: number; comp_name: string; country: string | null }[]>(Prisma.sql`
    SELECT d.league_id, d.comp_name, d.country
    FROM football.competition_dim d
    LEFT JOIN football.competition_names_ar a ON a.league_id = d.league_id
    WHERE d.is_youth = false AND a.league_id IS NULL
  `);
  const trophies = await prisma.gpAskableTrophy.findMany({
    where: { nameAr: null },
    select: { id: true, compName: true, country: true },
  });
  const byKey = new Map<
    string,
    { name: string; country: string; leagueIds: number[]; trophyIds: string[] }
  >();
  for (const d of dim) {
    const k = `${d.comp_name.toLowerCase()}||${(d.country ?? "").toLowerCase()}`;
    const e = byKey.get(k) ?? { name: d.comp_name, country: d.country ?? "", leagueIds: [], trophyIds: [] };
    e.leagueIds.push(d.league_id);
    byKey.set(k, e);
  }
  for (const t of trophies) {
    const k = `${t.compName.toLowerCase()}||${t.country.toLowerCase()}`;
    const e = byKey.get(k) ?? { name: t.compName, country: t.country, leagueIds: [], trophyIds: [] };
    e.trophyIds.push(t.id);
    byKey.set(k, e);
  }
  let entries = [...byKey.values()];
  if (SAMPLE) entries = entries.slice(0, SAMPLE);
  console.log(`competition/trophy names needing name_ar: ${entries.length}`);
  let written = 0;
  for (const [b, batch] of chunk(entries, BATCH_SIZE).entries()) {
    try {
      const res = await nameBatch(
        COMP_SYSTEM_PROMPT,
        batch.map((e) => ({
          label: `${e.name}${e.country && e.country.toLowerCase() !== "world" ? ` (${e.country})` : ""}`,
        })),
      );
      for (let i = 0; i < batch.length; i++) {
        const ar = res.get(i + 1);
        const e = batch[i]!;
        if (!ar || !hasArabic(ar)) continue;
        if (DRY_RUN) {
          console.log(`  ${e.name} | ${e.country} → ${ar}`);
          continue;
        }
        for (const lid of e.leagueIds) {
          await prisma.competitionNameAr.upsert({
            where: { leagueId: lid },
            create: { leagueId: lid, nameAr: ar, verified: false },
            update: {},
          });
        }
        for (const tid of e.trophyIds) {
          await prisma.gpAskableTrophy.update({
            where: { id: tid },
            data: { nameAr: ar, nameArVerified: false },
          });
        }
        written++;
      }
      console.log(`[competitions] batch ${b + 1} done (names=${written})`);
    } catch (e) {
      console.error(`[competitions] batch ${b + 1} FAILED (skipped):`, (e as Error).message);
    }
  }
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set (add it to packages/db/.env)");
  }
  console.log(
    `Generate Arabic names [model=${MODEL}] [kind=${KIND}]${DRY_RUN ? " [DRY RUN]" : ""}${SAMPLE ? ` [sample=${SAMPLE}]` : ""} [batch=${BATCH_SIZE}]`,
  );
  if (KIND === "clubs" || KIND === "all") await generateClubs();
  if (KIND === "competitions" || KIND === "all") await generateCompetitions();
  console.log("GENERATION COMPLETE — next: pnpm --filter @fb/db verify:arabic-names");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
