import { describe, expect, it } from "vitest";
import { ATHENA_MODES, athenaModeNotice, parseAthenaMode } from "../src/index.js";

describe("server-side /athena-mode parsing", () => {
  it("accepts exactly the three supported modes, trimming whitespace", () => {
    expect(ATHENA_MODES).toEqual(["shadow", "guardian", "balanced"]);
    expect(parseAthenaMode("shadow")).toBe("shadow");
    expect(parseAthenaMode(" guardian ")).toBe("guardian");
    expect(parseAthenaMode("balanced")).toBe("balanced");
  });

  it("rejects unknown, empty, and malformed input", () => {
    expect(parseAthenaMode("SHADOW")).toBeNull();
    expect(parseAthenaMode("")).toBeNull();
    expect(parseAthenaMode("   ")).toBeNull();
    expect(parseAthenaMode(undefined)).toBeNull();
    expect(parseAthenaMode(null)).toBeNull();
    expect(parseAthenaMode("shadow guardian")).toBeNull();
  });

  it("renders an inline notice without secrets", () => {
    expect(athenaModeNotice("silent")).toBe("mode: shadow | guardian | balanced (got silent)");
    expect(athenaModeNotice(undefined)).toBe("mode: shadow | guardian | balanced");
    expect(athenaModeNotice("  ")).toBe("mode: shadow | guardian | balanced");
  });
});
