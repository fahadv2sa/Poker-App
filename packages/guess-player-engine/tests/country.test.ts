import { describe, expect, it } from "vitest";
import {
  canonicalCountry,
  isYouthOrReserveTeamName,
  sameCountry,
} from "../src/country.js";

describe("country canonicalization (aliases verified against live data)", () => {
  it("maps the API spelling variants to the nationalities spelling", () => {
    expect(sameCountry("Ivory Coast", "Côte d'Ivoire")).toBe(true);
    expect(sameCountry("South Korea", "Korea Republic")).toBe(true);
    expect(sameCountry("North Korea", "Korea DPR")).toBe(true);
    expect(sameCountry("FYR Macedonia", "North Macedonia")).toBe(true);
    expect(sameCountry("Bosnia & Herzegovina", "Bosnia and Herzegovina")).toBe(true);
    expect(sameCountry("Rep. Of Ireland", "Republic of Ireland")).toBe(true);
    expect(sameCountry("China", "China PR")).toBe(true);
    expect(sameCountry("Czechia", "Czech Republic")).toBe(true);
    expect(sameCountry("Cape Verde Islands", "Cape Verde")).toBe(true);
  });
  it("is diacritic- and case-insensitive", () => {
    expect(sameCountry("COTE D'IVOIRE", "Côte d'Ivoire")).toBe(true);
    expect(sameCountry("egypt", "Egypt")).toBe(true);
  });
  it("distinct countries stay distinct", () => {
    expect(sameCountry("Korea Republic", "Korea DPR")).toBe(false);
    expect(sameCountry("Congo", "Congo DR")).toBe(false);
    expect(sameCountry("Guinea", "Guinea-Bissau")).toBe(false);
    expect(sameCountry("Ireland", "Northern Ireland")).toBe(false);
  });
  it("canonicalCountry is idempotent", () => {
    for (const n of ["Ivory Coast", "Côte d'Ivoire", "Egypt", "South Korea"]) {
      expect(canonicalCountry(canonicalCountry(n))).toBe(canonicalCountry(n));
    }
  });
});

describe("youth / reserve national-side filtering", () => {
  it("rejects U-teams and B-teams (observed in NATIONAL_SENIOR stat lines)", () => {
    for (const name of [
      "Belgium U21",
      "France U-19",
      "Côte d'Ivoire U20",
      "USA U19",
      "Algeria B",
      "Morocco B",
    ]) {
      expect(isYouthOrReserveTeamName(name)).toBe(true);
    }
  });
  it("keeps senior sides", () => {
    for (const name of ["Belgium", "Brazil", "Ivory Coast", "Korea Republic", "USA"]) {
      expect(isYouthOrReserveTeamName(name)).toBe(false);
    }
  });
});
