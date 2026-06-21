import { describe, expect, it } from "vitest";
import { hasConnectedHuman } from "../src/presence.js";

/**
 * The room teardown keep-alive predicate. The bug being fixed: bots are seated
 * connected:true, so `some(p => p.connected)` stayed true after all humans left
 * and the table never tore down (memory/identity-pool leak). The teardown must
 * count HUMANS only.
 */

const P = (connected: boolean, isBot?: boolean) => ({ connected, isBot });

describe("hasConnectedHuman", () => {
  it("true when a human is connected", () => {
    expect(hasConnectedHuman([P(true, false)])).toBe(true);
  });

  it("FALSE when only bots are connected and no human remains (the leak fix)", () => {
    // A human seat that has left (connected:false) + two connected bots.
    expect(hasConnectedHuman([P(false, false), P(true, true), P(true, true)])).toBe(false);
  });

  it("true when a human and bots are both connected", () => {
    expect(hasConnectedHuman([P(true, false), P(true, true), P(true, true)])).toBe(true);
  });

  it("false for an empty table", () => {
    expect(hasConnectedHuman([])).toBe(false);
  });

  it("false when every bot is connected but every human disconnected", () => {
    expect(hasConnectedHuman([P(false, false), P(false, false), P(true, true)])).toBe(false);
  });

  it("treats a player with no isBot flag as a human (manual rooms unaffected)", () => {
    expect(hasConnectedHuman([P(true)])).toBe(true);
    expect(hasConnectedHuman([P(false)])).toBe(false);
  });
});
