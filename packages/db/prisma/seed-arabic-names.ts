import "dotenv/config";

import { prisma } from "../src/client";
import { Prisma } from "../src/generated/client";
import { gpCountryLikeClubNames } from "../src/gp-facts";

/**
 * CURATED Arabic-name seed — the hand-verified tier of the Arabic-first plan
 * (approved 2026-07-06, STRICT policy). Everything written here is set
 * verified=true immediately because a human wrote and reviewed each string:
 *
 *   1. COUNTRIES (all rows): standard Arabic country names → nationalities +
 *      the kind=NATIONAL_TEAM club rows sharing those names.
 *   2. GLOSSARY (major competitions + trophies): one shared map applied to BOTH
 *      football.competition_names_ar (by league_id) and
 *      guess_player.gp_askable_trophies — the same competition reads
 *      identically everywhere.
 *   3. GIANT CLUBS: exact-string transliterations for the most-played clubs.
 *
 * Idempotent upserts; re-running refreshes the curated tier without touching
 * LLM-generated rows. The long tail is filled by generate-arabic-names.ts and
 * gated by verify-arabic-names.ts + the owner audit (never verified here).
 */

// ---- 1. countries (name → Arabic) ------------------------------------------

const COUNTRIES_AR: Record<string, string> = {
  Albania: "ألبانيا", Algeria: "الجزائر", Angola: "أنغولا", Argentina: "الأرجنتين",
  Armenia: "أرمينيا", Australia: "أستراليا", Austria: "النمسا", Azerbaijan: "أذربيجان",
  Belarus: "بيلاروسيا", Belgium: "بلجيكا", Benin: "بنين", Bermuda: "برمودا",
  Bolivia: "بوليفيا", "Bosnia and Herzegovina": "البوسنة والهرسك", Brazil: "البرازيل",
  Bulgaria: "بلغاريا", "Burkina Faso": "بوركينا فاسو", Burundi: "بوروندي",
  Cameroon: "الكاميرون", Canada: "كندا", "Cape Verde": "الرأس الأخضر",
  "Cape Verde Islands": "الرأس الأخضر", "Central African Republic": "جمهورية أفريقيا الوسطى",
  Chad: "تشاد", Chile: "تشيلي", "China PR": "الصين", Colombia: "كولومبيا",
  Comoros: "جزر القمر", Congo: "الكونغو", "Congo DR": "الكونغو الديمقراطية",
  "Costa Rica": "كوستاريكا", Croatia: "كرواتيا", Cuba: "كوبا", "Curaçao": "كوراساو",
  Cyprus: "قبرص", "Czech Republic": "التشيك", Czechia: "التشيك",
  "Côte d'Ivoire": "ساحل العاج", Denmark: "الدنمارك",
  "Dominican Republic": "جمهورية الدومينيكان", Ecuador: "الإكوادور", Egypt: "مصر",
  "El Salvador": "السلفادور", England: "إنجلترا", "Equatorial Guinea": "غينيا الاستوائية",
  Eritrea: "إريتريا", Estonia: "إستونيا", "Faroe Islands": "جزر فارو", Finland: "فنلندا",
  France: "فرنسا", "French Guiana": "غويانا الفرنسية", Gabon: "الغابون", Gambia: "غامبيا",
  Georgia: "جورجيا", Germany: "ألمانيا", Ghana: "غانا", Greece: "اليونان",
  Grenada: "غرينادا", Guadeloupe: "غوادلوب", Guatemala: "غواتيمالا", Guinea: "غينيا",
  "Guinea-Bissau": "غينيا بيساو", Haiti: "هايتي", Honduras: "هندوراس", Hungary: "المجر",
  Iceland: "آيسلندا", Indonesia: "إندونيسيا", Iran: "إيران", Iraq: "العراق",
  Israel: "إسرائيل", Italy: "إيطاليا", Jamaica: "جامايكا", Japan: "اليابان",
  Jordan: "الأردن", Kazakhstan: "كازاخستان", Kenya: "كينيا",
  "Korea DPR": "كوريا الشمالية", "Korea Republic": "كوريا الجنوبية", Kosovo: "كوسوفو",
  Laos: "لاوس", Latvia: "لاتفيا", Libya: "ليبيا", Liechtenstein: "ليختنشتاين",
  Lithuania: "ليتوانيا", Luxembourg: "لوكسمبورغ", Madagascar: "مدغشقر", Mali: "مالي",
  Malta: "مالطا", Martinique: "مارتينيك", Mauritania: "موريتانيا", Mauritius: "موريشيوس",
  Mexico: "المكسيك", Moldova: "مولدوفا", Montenegro: "الجبل الأسود", Morocco: "المغرب",
  Mozambique: "موزمبيق", Netherlands: "هولندا", "New Caledonia": "كاليدونيا الجديدة",
  "New Zealand": "نيوزيلندا", Niger: "النيجر", Nigeria: "نيجيريا",
  "North Macedonia": "مقدونيا الشمالية", "Northern Ireland": "أيرلندا الشمالية",
  Norway: "النرويج", Panama: "بنما", Paraguay: "باراغواي", Peru: "بيرو",
  Philippines: "الفلبين", Poland: "بولندا", Portugal: "البرتغال",
  "Puerto Rico": "بورتوريكو", Qatar: "قطر", "Republic of Ireland": "أيرلندا",
  Romania: "رومانيا", Russia: "روسيا", "Réunion": "ريونيون",
  "Saudi Arabia": "السعودية", Scotland: "اسكتلندا", Senegal: "السنغال",
  Serbia: "صربيا", "Sierra Leone": "سيراليون", Slovakia: "سلوفاكيا",
  Slovenia: "سلوفينيا", "South Africa": "جنوب أفريقيا", Spain: "إسبانيا",
  "St. Kitts and Nevis": "سانت كيتس ونيفيس", Suriname: "سورينام", Sweden: "السويد",
  Switzerland: "سويسرا", Tanzania: "تنزانيا", Thailand: "تايلاند", Togo: "توغو",
  "Trinidad and Tobago": "ترينيداد وتوباغو", Tunisia: "تونس", Turkey: "تركيا",
  "Türkiye": "تركيا", USA: "الولايات المتحدة", Uganda: "أوغندا", Ukraine: "أوكرانيا",
  Uruguay: "أوروغواي", Uzbekistan: "أوزبكستان", Venezuela: "فنزويلا", Wales: "ويلز",
  Zambia: "زامبيا", Zimbabwe: "زيمبابوي",
};

// ---- 2. shared competition/trophy glossary ---------------------------------
// Matching key: lower(name); `countries` (lowercased) narrows same-named
// entries (the many "Super Cup"s); omitted = the name is unambiguous.

interface GlossaryEntry {
  en: string;
  countries?: string[];
  ar: string;
}

const GLOSSARY: GlossaryEntry[] = [
  // top-5 leagues + their second tiers
  { en: "Premier League", countries: ["england"], ar: "الدوري الإنجليزي الممتاز" },
  { en: "La Liga", countries: ["spain"], ar: "الدوري الإسباني" },
  { en: "Serie A", countries: ["italy"], ar: "الدوري الإيطالي" },
  { en: "Bundesliga", countries: ["germany"], ar: "الدوري الألماني" },
  { en: "Ligue 1", countries: ["france"], ar: "الدوري الفرنسي" },
  { en: "Championship", countries: ["england"], ar: "دوري البطولة الإنجليزية" },
  { en: "Segunda División", countries: ["spain"], ar: "الدوري الإسباني الدرجة الثانية" },
  { en: "Serie B", countries: ["italy"], ar: "الدوري الإيطالي الدرجة الثانية" },
  { en: "2. Bundesliga", countries: ["germany"], ar: "الدوري الألماني الدرجة الثانية" },
  { en: "Ligue 2", countries: ["france"], ar: "الدوري الفرنسي الدرجة الثانية" },
  // European club competitions
  { en: "UEFA Champions League", ar: "دوري أبطال أوروبا" },
  { en: "UEFA Europa League", ar: "الدوري الأوروبي" },
  { en: "UEFA Europa Conference League", ar: "دوري المؤتمر الأوروبي" },
  { en: "UEFA Conference League", ar: "دوري المؤتمر الأوروبي" },
  { en: "UEFA Super Cup", ar: "كأس السوبر الأوروبي" },
  // world club competitions
  { en: "FIFA Club World Cup", ar: "كأس العالم للأندية" },
  { en: "FIFA Intercontinental Cup", ar: "كأس إنتركونتيننتال" },
  // domestic cups + super cups
  { en: "FA Cup", countries: ["england"], ar: "كأس الاتحاد الإنجليزي" },
  { en: "League Cup", countries: ["england"], ar: "كأس الرابطة الإنجليزية" },
  { en: "Community Shield", countries: ["england"], ar: "الدرع الخيرية الإنجليزية" },
  { en: "Copa del Rey", countries: ["spain"], ar: "كأس ملك إسبانيا" },
  { en: "Super Cup", countries: ["spain"], ar: "كأس السوبر الإسباني" },
  { en: "Coppa Italia", countries: ["italy"], ar: "كأس إيطاليا" },
  { en: "Super Cup", countries: ["italy"], ar: "كأس السوبر الإيطالي" },
  { en: "DFB Pokal", countries: ["germany"], ar: "كأس ألمانيا" },
  { en: "Super Cup", countries: ["germany"], ar: "كأس السوبر الألماني" },
  { en: "Coupe de France", countries: ["france"], ar: "كأس فرنسا" },
  { en: "Coupe de la Ligue", countries: ["france"], ar: "كأس الرابطة الفرنسية" },
  { en: "Trophée des Champions", countries: ["france"], ar: "كأس الأبطال الفرنسي" },
  { en: "Taça de Portugal", countries: ["portugal"], ar: "كأس البرتغال" },
  { en: "Taça da Liga", countries: ["portugal"], ar: "كأس الرابطة البرتغالية" },
  { en: "Super Cup", countries: ["portugal"], ar: "كأس السوبر البرتغالي" },
  { en: "Super Cup", countries: ["belgium"], ar: "كأس السوبر البلجيكي" },
  { en: "Super Cup", countries: ["netherlands"], ar: "كأس السوبر الهولندي" },
  // other leagues
  { en: "Eredivisie", countries: ["netherlands"], ar: "الدوري الهولندي" },
  { en: "Primeira Liga", countries: ["portugal"], ar: "الدوري البرتغالي" },
  { en: "Süper Lig", countries: ["turkey"], ar: "الدوري التركي" },
  { en: "Jupiler Pro League", countries: ["belgium"], ar: "الدوري البلجيكي" },
  { en: "First Division A", countries: ["belgium"], ar: "الدوري البلجيكي" },
  { en: "Super League", countries: ["switzerland"], ar: "الدوري السويسري" },
  { en: "Serie A", countries: ["brazil"], ar: "الدوري البرازيلي" },
  { en: "Major League Soccer", countries: ["usa"], ar: "الدوري الأمريكي" },
  { en: "Liga Profesional Argentina", countries: ["argentina"], ar: "الدوري الأرجنتيني" },
  { en: "Premiership", countries: ["scotland"], ar: "الدوري الاسكتلندي" },
  { en: "Ekstraklasa", countries: ["poland"], ar: "الدوري البولندي" },
  { en: "Liga MX", countries: ["mexico"], ar: "الدوري المكسيكي" },
  { en: "Premier League", countries: ["russia"], ar: "الدوري الروسي" },
  { en: "Pro League", countries: ["saudi-arabia", "saudi arabia"], ar: "الدوري السعودي للمحترفين" },
  { en: "HNL", countries: ["croatia"], ar: "الدوري الكرواتي" },
  { en: "Super League 1", countries: ["greece"], ar: "الدوري اليوناني" },
  { en: "Superliga", countries: ["denmark"], ar: "الدوري الدنماركي" },
  { en: "Bundesliga", countries: ["austria"], ar: "الدوري النمساوي" },
  { en: "League One", countries: ["england"], ar: "الدرجة الأولى الإنجليزية (ليغ وان)" },
  // national-team competitions/trophies
  { en: "World Cup", ar: "كأس العالم" },
  { en: "FIFA World Cup", ar: "كأس العالم" },
  { en: "Euro Championship", ar: "كأس أمم أوروبا" },
  { en: "European Championship", ar: "كأس أمم أوروبا" },
  { en: "Copa America", ar: "كوبا أمريكا" },
  { en: "Africa Cup of Nations", ar: "كأس الأمم الأفريقية" },
  { en: "Asian Cup", ar: "كأس آسيا" },
  { en: "AFC Asian Cup", ar: "كأس آسيا" },
  { en: "Gold Cup", ar: "الكأس الذهبية (الكونكاكاف)" },
  { en: "UEFA Nations League", ar: "دوري الأمم الأوروبية" },
  { en: "Nations League", ar: "دوري الأمم الأوروبية" },
  { en: "Confederations Cup", ar: "كأس القارات" },
  { en: "Finalissima", ar: "فيناليسيما" },
  { en: "Arab Cup", ar: "كأس العرب" },
  { en: "Friendlies", ar: "مباريات ودية دولية" },
  { en: "Friendlies Clubs", ar: "مباريات ودية للأندية" },
];

// ---- 3. giant clubs (EXACT clubs.name string → Arabic transliteration) ------

const CLUBS_AR: Record<string, string> = {
  "Real Madrid": "ريال مدريد", Barcelona: "برشلونة", "Atletico Madrid": "أتلتيكو مدريد",
  Sevilla: "إشبيلية", Valencia: "فالنسيا", Villarreal: "فياريال",
  "Real Sociedad": "ريال سوسيداد", "Athletic Club": "أتلتيك بلباو",
  "Real Betis": "ريال بيتيس", Espanyol: "إسبانيول", "Celta Vigo": "سيلتا فيغو",
  Osasuna: "أوساسونا", "Rayo Vallecano": "رايو فاييكانو", Getafe: "خيتافي",
  Levante: "ليفانتي", "Las Palmas": "لاس بالماس",
  "Manchester United": "مانشستر يونايتد", "Manchester City": "مانشستر سيتي",
  Liverpool: "ليفربول", Chelsea: "تشيلسي", Arsenal: "أرسنال", Tottenham: "توتنهام",
  Newcastle: "نيوكاسل", Everton: "إيفرتون", "Aston Villa": "أستون فيلا",
  "West Ham": "وست هام", Leicester: "ليستر سيتي", Southampton: "ساوثهامبتون",
  "Crystal Palace": "كريستال بالاس", Bournemouth: "بورنموث",
  Juventus: "يوفنتوس", "AC Milan": "ميلان", Inter: "إنتر ميلان", Napoli: "نابولي",
  "AS Roma": "روما", Lazio: "لاتسيو", Atalanta: "أتالانتا", Fiorentina: "فيورنتينا",
  Torino: "تورينو", Bologna: "بولونيا", Sampdoria: "سامبدوريا", Genoa: "جنوى",
  Udinese: "أودينيزي", Cagliari: "كالياري", Sassuolo: "ساسولو",
  "Hellas Verona": "هيلاس فيرونا", Empoli: "إمبولي",
  "Bayern München": "بايرن ميونخ", "Borussia Dortmund": "بوروسيا دورتموند",
  "Bayer Leverkusen": "باير ليفركوزن", "VfB Stuttgart": "شتوتغارت",
  "Werder Bremen": "فيردر بريمن", "Eintracht Frankfurt": "آينتراخت فرانكفورت",
  "Borussia Mönchengladbach": "بوروسيا مونشنغلادباخ", "FC Augsburg": "أوغسبورغ",
  "VfL Wolfsburg": "فولفسبورغ", "Hertha BSC": "هيرتا برلين", "SC Freiburg": "فرايبورغ",
  "FSV Mainz 05": "ماينتس", "FC Schalke 04": "شالكه", "1899 Hoffenheim": "هوفنهايم",
  "Hamburger SV": "هامبورغ",
  "Paris Saint Germain": "باريس سان جيرمان", Marseille: "مارسيليا", Lyon: "ليون",
  Monaco: "موناكو", Lille: "ليل", Nice: "نيس", Rennes: "رين",
  "Saint Etienne": "سانت إتيان", Toulouse: "تولوز", Lorient: "لوريان",
  Montpellier: "مونبلييه", Nantes: "نانت", Reims: "رانس", Bordeaux: "بوردو",
  Metz: "ميتز",
  Ajax: "أياكس أمستردام",
  // Post-audit curation (2026-07-06): notable clubs the pipeline dropped.
  Guingamp: "غانغان",
  Heerenveen: "هيرينفين",
  "FC Cartagena": "قرطاجنة",
  // THE River Plate (Liga Profesional Argentina — verified via season stats);
  // the Uruguayan "CA River Plate" and Paraguayan "Club River Plate" rows are
  // stripped below so the name is unambiguous.
  "River Plate": "ريفر بليت",
};

/** Rows whose GENERATED Arabic must be removed (Arabic-only ⇒ excluded):
 *  verified same-name clubs in other countries that would shadow the giant. */
const STRIP_CLUB_AR: string[] = ["CA River Plate", "Club River Plate"];

async function main(): Promise<void> {
  // 1) countries → nationalities + national-team club rows
  let nat = 0;
  for (const [en, ar] of Object.entries(COUNTRIES_AR)) {
    const r1 = await prisma.nationality.updateMany({
      where: { name: en },
      data: { nameAr: ar, nameArVerified: true },
    });
    const r2 = await prisma.club.updateMany({
      where: { name: en, kind: "NATIONAL_TEAM" },
      data: { nameAr: ar, nameArVerified: true },
    });
    nat += r1.count + r2.count;
  }
  console.log(`[arabic-names] countries: ${nat} rows named (nationalities + NT clubs)`);

  // 2) glossary → competition_names_ar (by league_id) + trophy whitelist
  let comps = 0;
  let trophies = 0;
  for (const g of GLOSSARY) {
    const dimRows = await prisma.$queryRaw<{ league_id: number; country: string | null }[]>(
      Prisma.sql`SELECT league_id, country FROM football.competition_dim WHERE lower(comp_name) = ${g.en.toLowerCase()}`,
    );
    for (const row of dimRows) {
      const c = (row.country ?? "").toLowerCase();
      if (g.countries && !g.countries.includes(c) && c !== "" && c !== "world") continue;
      await prisma.competitionNameAr.upsert({
        where: { leagueId: row.league_id },
        create: { leagueId: row.league_id, nameAr: g.ar, verified: true },
        update: { nameAr: g.ar, verified: true },
      });
      comps++;
    }
    if (g.countries) {
      for (const c of g.countries) {
        const r = await prisma.gpAskableTrophy.updateMany({
          where: {
            compName: { equals: g.en, mode: "insensitive" },
            country: { equals: c, mode: "insensitive" },
          },
          data: { nameAr: g.ar, nameArVerified: true },
        });
        trophies += r.count;
      }
    } else {
      const r = await prisma.gpAskableTrophy.updateMany({
        where: { compName: { equals: g.en, mode: "insensitive" } },
        data: { nameAr: g.ar, nameArVerified: true },
      });
      trophies += r.count;
    }
  }
  console.log(`[arabic-names] glossary: ${comps} competitions + ${trophies} whitelist trophies named`);

  // 3) giant clubs (skip country-named pseudo-clubs defensively)
  for (const name of STRIP_CLUB_AR) {
    await prisma.club.updateMany({
      where: { name, kind: "CLUB" },
      data: { nameAr: null, nameArVerified: false },
    });
  }
  const pseudo = new Set((await gpCountryLikeClubNames()).map((n) => n.toLowerCase()));
  let clubs = 0;
  for (const [en, ar] of Object.entries(CLUBS_AR)) {
    if (pseudo.has(en.toLowerCase())) continue;
    const r = await prisma.club.updateMany({
      where: { name: en, kind: "CLUB" },
      data: { nameAr: ar, nameArVerified: true },
    });
    if (r.count === 0) console.warn(`[arabic-names] WARN club not found: ${en}`);
    clubs += r.count;
  }
  console.log(`[arabic-names] clubs: ${clubs}/${Object.keys(CLUBS_AR).length} giants named`);

  const [vNat, vClub, vComp, vTr] = await Promise.all([
    prisma.nationality.count({ where: { nameArVerified: true } }),
    prisma.club.count({ where: { nameArVerified: true } }),
    prisma.competitionNameAr.count({ where: { verified: true } }),
    prisma.gpAskableTrophy.count({ where: { nameArVerified: true } }),
  ]);
  console.log(`[arabic-names] VERIFIED totals — nationalities=${vNat} clubs=${vClub} competitions=${vComp} trophies=${vTr}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
