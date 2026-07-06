import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { answerQuestion } from "../src/verify.js";
import type { GpFactPack } from "../src/types.js";

/**
 * Golden tests over REAL FactPacks frozen from the live local DB
 * (regenerate: pnpm --filter @fb/db gp:export-fixtures). Two layers:
 *   1. invariants that must hold for EVERY exported player;
 *   2. hand-verified real-world facts for named players — these are the
 *      zero-error acceptance cases (a failure = the engine would have lied
 *      in a live round).
 */
const FIXTURES = dirname(fileURLToPath(import.meta.url)) + "/fixtures";
const load = (f: string) => JSON.parse(readFileSync(join(FIXTURES, f), "utf8"));

const labels = load("_labels.json") as {
  clubsByName: Record<string, string>;
  competitionsByName: Record<string, number>;
  trophyLeagueIds: Record<string, number[]>;
};
const club = (name: string): string => {
  const id = labels.clubsByName[name];
  if (!id) throw new Error(`label missing for club ${name}`);
  return id;
};

const packs: GpFactPack[] = readdirSync(FIXTURES)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map(load);

const UCL = { compName: "UEFA Champions League", country: "Europe" };
const UCL_NARROWED = { ...UCL, leagueIds: labels.trophyLeagueIds["UEFA Champions League||Europe"] };

describe("golden invariants (every exported player)", () => {
  it("has fixtures", () => {
    expect(packs.length).toBeGreaterThanOrEqual(4);
  });
  for (const f of packs) {
    describe(f.name, () => {
      it("answers YES for every recorded (club, season) and career club", () => {
        for (const cs of f.clubSeasons) {
          expect(answerQuestion({ template: "CLUB_EVER", clubId: cs.clubId }, f)).toBe("YES");
          expect(
            answerQuestion({ template: "CLUB_SEASON", clubId: cs.clubId, season: cs.season }, f),
          ).toBe("YES");
        }
      });
      it("answers NO for a phantom club (career list is complete)", () => {
        expect(
          answerQuestion({ template: "CLUB_EVER", clubId: "00000000-0000-0000-0000-000000000000" }, f),
        ).toBe("NO");
      });
      it("confirms its own nationality and denies another", () => {
        expect(answerQuestion({ template: "NATIONALITY", countryName: f.nationalityName }, f)).toBe(
          "YES",
        );
        const other = f.nationalityName === "Japan" ? "Iceland" : "Japan";
        expect(answerQuestion({ template: "NATIONALITY", countryName: other }, f)).toBe("NO");
      });
      it("answers YES for every dated trophy season", () => {
        for (const t of f.trophies) {
          const trophy = { compName: t.compName, country: t.country };
          expect(answerQuestion({ template: "TROPHY_EVER", trophy }, f)).toBe("YES");
          if (t.season !== null) {
            expect(
              answerQuestion({ template: "TROPHY_SEASON", trophy, season: t.season }, f),
            ).toBe("YES");
          }
        }
      });
      it("never carries forbidden-topic data", () => {
        const keys = Object.keys(f).map((k) => k.toLowerCase());
        for (const banned of ["position", "height", "weight", "photo", "birth"]) {
          expect(keys.some((k) => k.includes(banned))).toBe(false);
        }
      });
    });
  }
});

describe("Mohamed Salah — hand-verified facts", () => {
  const f = packs.find((p) => p.name === "Mohamed Salah")!;
  it("clubs: Liverpool/Chelsea/Roma yes, Real Madrid/Barcelona no", () => {
    expect(answerQuestion({ template: "CLUB_EVER", clubId: club("Liverpool") }, f)).toBe("YES");
    expect(answerQuestion({ template: "CLUB_EVER", clubId: club("Chelsea") }, f)).toBe("YES");
    expect(answerQuestion({ template: "CLUB_EVER", clubId: club("AS Roma") }, f)).toBe("YES");
    expect(answerQuestion({ template: "CLUB_EVER", clubId: club("Real Madrid") }, f)).toBe("NO");
    expect(answerQuestion({ template: "CLUB_EVER", clubId: club("Barcelona") }, f)).toBe("NO");
  });
  it("nationality/NT: Egypt yes (both), Brazil no", () => {
    expect(answerQuestion({ template: "NATIONALITY", countryName: "Egypt" }, f)).toBe("YES");
    expect(answerQuestion({ template: "NATIONAL_TEAM", countryName: "Egypt" }, f)).toBe("YES");
    expect(answerQuestion({ template: "NATIONAL_TEAM", countryName: "Brazil" }, f)).toBe("NO");
  });
  it("competitions: Premier League yes, La Liga no", () => {
    expect(
      answerQuestion(
        { template: "COMPETITION_EVER", leagueId: labels.competitionsByName["Premier League"]! },
        f,
      ),
    ).toBe("YES");
    expect(
      answerQuestion(
        { template: "COMPETITION_EVER", leagueId: labels.competitionsByName["La Liga"]! },
        f,
      ),
    ).toBe("NO");
  });
  it("UCL: won it, in 2018/19, WITH Liverpool — not with Chelsea", () => {
    expect(answerQuestion({ template: "TROPHY_EVER", trophy: UCL }, f)).toBe("YES");
    expect(answerQuestion({ template: "TROPHY_SEASON", trophy: UCL, season: 2018 }, f)).toBe("YES");
    expect(answerQuestion({ template: "TROPHY_SEASON", trophy: UCL, season: 2017 }, f)).toBe("NO");
    expect(
      answerQuestion({ template: "TROPHY_WITH_CLUB", trophy: UCL_NARROWED, clubId: club("Liverpool") }, f),
    ).toBe("YES");
    expect(
      answerQuestion({ template: "TROPHY_WITH_CLUB", trophy: UCL_NARROWED, clubId: club("Chelsea") }, f),
    ).toBe("NO");
  });
});

describe("Yaya Touré — the NT-alias and pseudo-club regression case", () => {
  const f = packs.find((p) => p.name === "Yaya Touré")!;
  it("NT answers YES under BOTH spellings (Ivory Coast / Côte d'Ivoire)", () => {
    expect(answerQuestion({ template: "NATIONAL_TEAM", countryName: "Ivory Coast" }, f)).toBe("YES");
    expect(answerQuestion({ template: "NATIONAL_TEAM", countryName: "Côte d'Ivoire" }, f)).toBe(
      "YES",
    );
    expect(answerQuestion({ template: "NATIONALITY", countryName: "Ivory Coast" }, f)).toBe("YES");
  });
  it("the misclassified 'Ivory Coast' club row never appears as a club fact", () => {
    // 2008 must be a single-club season (Barcelona) — the NT stint was
    // previously leaking in as a second club and breaking attribution.
    const clubs2008 = [...new Set(f.clubSeasons.filter((c) => c.season === 2008).map((c) => c.clubId))];
    expect(clubs2008).toEqual([club("Barcelona")]);
  });
  it("clubs: Barcelona + Manchester City yes; Liverpool no", () => {
    expect(answerQuestion({ template: "CLUB_EVER", clubId: club("Barcelona") }, f)).toBe("YES");
    expect(answerQuestion({ template: "CLUB_EVER", clubId: club("Manchester City") }, f)).toBe(
      "YES",
    );
    expect(answerQuestion({ template: "CLUB_EVER", clubId: club("Liverpool") }, f)).toBe("NO");
  });
  it("UCL 2008/09 won WITH Barcelona — not with Manchester City", () => {
    expect(answerQuestion({ template: "TROPHY_SEASON", trophy: UCL, season: 2008 }, f)).toBe("YES");
    expect(
      answerQuestion({ template: "TROPHY_WITH_CLUB", trophy: UCL_NARROWED, clubId: club("Barcelona") }, f),
    ).toBe("YES");
    expect(
      answerQuestion(
        { template: "TROPHY_WITH_CLUB", trophy: UCL_NARROWED, clubId: club("Manchester City") },
        f,
      ),
    ).toBe("NO");
  });
});

describe("trophy-less player — negatives stay provable", () => {
  const f = packs.find((p) => p.trophies.length === 0)!;
  it("TROPHY_EVER is NO (import complete), not UNKNOWN", () => {
    expect(f.trophiesImported).toBe(true);
    expect(answerQuestion({ template: "TROPHY_EVER", trophy: UCL }, f)).toBe("NO");
  });
});
