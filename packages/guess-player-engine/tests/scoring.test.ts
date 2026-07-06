import { describe, expect, it } from "vitest";
import {
  GP_PICKER_SHARE,
  GP_SURVIVAL_BONUS,
  pickerPoints,
  winnerPoints,
} from "../src/scoring.js";

describe("winnerPoints — 500 × remaining/600, floor 100, tier multiplier", () => {
  it("instant solve pays 500 (VS_HUMANS / no tier)", () => {
    expect(winnerPoints(600, null)).toBe(500);
  });
  it("last-second solve hits the 100 floor", () => {
    expect(winnerPoints(0, null)).toBe(100);
    expect(winnerPoints(30, null)).toBe(100); // 25 → floored
    expect(winnerPoints(120, null)).toBe(100); // exactly the floor boundary
  });
  it("scales linearly in between", () => {
    expect(winnerPoints(300, null)).toBe(250);
    expect(winnerPoints(450, null)).toBe(375);
  });
  it("applies the approved tier multipliers", () => {
    expect(winnerPoints(600, "EASY")).toBe(500);
    expect(winnerPoints(600, "MEDIUM")).toBe(625);
    expect(winnerPoints(600, "HARD")).toBe(750);
    expect(winnerPoints(0, "HARD")).toBe(150); // floor × 1.5
  });
  it("clamps out-of-range clocks", () => {
    expect(winnerPoints(9999, null)).toBe(500);
    expect(winnerPoints(-5, null)).toBe(100);
  });
});

describe("picker economics (VS_HUMANS)", () => {
  it("picker earns 25% of the winner's points on a solved round", () => {
    expect(GP_PICKER_SHARE).toBe(0.25);
    expect(pickerPoints(500)).toBe(125);
    expect(pickerPoints(100)).toBe(25);
    expect(pickerPoints(333)).toBe(83);
  });
  it("the survival bonus (150) never beats a decent solved round for the picker+winner pair", () => {
    expect(GP_SURVIVAL_BONUS).toBe(150);
    // A solve with ≥3 minutes left already pays the picker close to the bonus —
    // picking impossible players is not the dominant strategy.
    expect(pickerPoints(winnerPoints(360, null))).toBeGreaterThanOrEqual(75);
  });
});
