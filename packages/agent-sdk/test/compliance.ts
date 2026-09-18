import { describe, expect, it } from "vitest";
import type { AthenaAgentAdapter } from "../src/index.js";

export function runAdapterComplianceSuite(adapter: AthenaAgentAdapter, before: unknown, after: unknown) {
  describe(`${adapter.id} adapter compliance`, () => {
    it("normalizes action and result with session identity", () => {
      expect(adapter.normalizeBeforeAction(before).sessionId).toBeTruthy();
      expect(adapter.normalizeAfterAction(after).sessionId).toBeTruthy();
    });
    it("reports truthful control capability", () => {
      expect(adapter.encodeControl("REPLAN", "test", "control")).toBeDefined();
    });
    it("never creates user-role control", () => {
      expect(JSON.stringify(adapter.encodeControl("REPLAN", "test", "control"))).not.toMatch(/"role"\s*:\s*"user"/);
    });
  });
}
