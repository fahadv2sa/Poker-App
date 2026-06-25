import { describe, expect, it } from "vitest";
import { ipAllowed } from "@/lib/admin-ip";

describe("ipAllowed", () => {
  it("is unrestricted when the allowlist is unset or empty", () => {
    expect(ipAllowed(undefined, "1.2.3.4")).toBe(true);
    expect(ipAllowed("", null)).toBe(true);
    expect(ipAllowed("  ,  ", "9.9.9.9")).toBe(true);
  });

  it("allows only listed IPs when configured", () => {
    expect(ipAllowed("1.2.3.4, 5.6.7.8", "5.6.7.8")).toBe(true);
    expect(ipAllowed("1.2.3.4,5.6.7.8", "1.2.3.4")).toBe(true);
    expect(ipAllowed("1.2.3.4", "9.9.9.9")).toBe(false);
  });

  it("denies a null IP when the allowlist is configured", () => {
    expect(ipAllowed("1.2.3.4", null)).toBe(false);
  });
});
