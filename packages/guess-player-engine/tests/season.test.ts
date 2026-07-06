import { describe, expect, it } from "vitest";
import { parseTrophySeason } from "../src/season.js";

describe("parseTrophySeason", () => {
  it("cross-year seasons take the START year (API season convention)", () => {
    expect(parseTrophySeason("2018/2019")).toBe(2018);
    expect(parseTrophySeason("2010/2011")).toBe(2010);
    expect(parseTrophySeason("2018/19")).toBe(2018);
    expect(parseTrophySeason(" 2018 / 2019 ")).toBe(2018);
  });
  it("calendar-year seasons parse as-is", () => {
    expect(parseTrophySeason("2013")).toBe(2013);
  });
  it("tournament + host-country formats keep the year", () => {
    expect(parseTrophySeason("2012 Poland/Ukraine")).toBe(2012);
    expect(parseTrophySeason("2008 Austria/Switzer")).toBe(2008);
    expect(parseTrophySeason("2014 Brazil")).toBe(2014);
    expect(parseTrophySeason("2015 Equatorial Guin")).toBe(2015);
    expect(parseTrophySeason("Venezuela 2009")).toBe(2009); // host BEFORE year
  });
  it("LatAm half-season labels keep the start year", () => {
    expect(parseTrophySeason("2002/2003 Clausura")).toBe(2002);
    expect(parseTrophySeason("2004/2005 Apertura")).toBe(2004);
    expect(parseTrophySeason("2012/2013 Torneo Fin")).toBe(2012);
  });
  it("blank / null / garbage → null (never a guessed year)", () => {
    expect(parseTrophySeason("")).toBeNull();
    expect(parseTrophySeason(null)).toBeNull();
    expect(parseTrophySeason(undefined)).toBeNull();
    expect(parseTrophySeason("unknown")).toBeNull();
    expect(parseTrophySeason("19/20")).toBeNull();
    expect(parseTrophySeason("Apertura")).toBeNull();
  });
});
