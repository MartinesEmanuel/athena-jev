import { describe, expect, it } from "vitest";
import { ToolRouter, buildToolRoutingState, routeToolFamilies, type ToolDescriptor, type ToolRoutingJudge } from "../src/index.js";

const tools: ToolDescriptor[] = [
  { id: "read", name: "read", family: "INSPECT" }, { id: "grep", name: "grep", family: "SEARCH" }, { id: "edit", name: "edit", family: "EDIT" },
  { id: "bash", name: "bash", family: "EXECUTE" }, { id: "web", name: "web", family: "WEB" }, { id: "mcp_issue", name: "mcp_issue", family: "EXTERNAL", external: true }, { id: "custom", name: "custom", family: "OTHER" },
];
const state = (goal: string, extra: Partial<{ phase: string; obligations: string[] }> = {}) => buildToolRoutingState({ goal, phase: extra.phase, unresolvedObligations: extra.obligations, tools });
const scores = (included: string[]) => Object.fromEntries(["INSPECT", "SEARCH", "EDIT", "EXECUTE", "WEB", "EXTERNAL", "OTHER"].map((family) => [family, included.includes(family) ? 0.9 : 0.05]));

describe("tool routing policy", () => {
  it("retains inspect/search for investigation", () => {
    const result = routeToolFamilies(state("Find where JWT expiration is validated."), tools, scores(["INSPECT", "SEARCH"]));
    expect(result.selectedFamilies).toEqual(expect.arrayContaining(["INSPECT", "SEARCH", "OTHER"]));
  });
  it("retains inspect/edit for a change", () => expect(routeToolFamilies(state("Change timeout from 5s to 10s."), tools, scores(["EDIT"])).selectedFamilies).toEqual(expect.arrayContaining(["INSPECT", "EDIT"])));
  it("retains execute for failing tests and verify", () => expect(routeToolFamilies(state("Tests are failing after the last edit.", { phase: "VERIFY" }), tools, scores(["EXECUTE"])).selectedFamilies).toEqual(expect.arrayContaining(["INSPECT", "EXECUTE"])));
  it("retains web research and explicit external capability", () => {
    expect(routeToolFamilies(state("Check current OpenCode plugin documentation."), tools, scores(["WEB"])).selectedFamilies).toContain("WEB");
    expect(routeToolFamilies(state("Use the MCP external integration."), tools, scores([])).selectedFamilies).toContain("EXTERNAL");
  });
  it("fails open for uncertain, malformed, empty and no-savings outcomes", () => {
    expect(routeToolFamilies(state("ambiguous"), tools, { INSPECT: 0.5 }).mode).toBe("FULL");
    expect(routeToolFamilies(state("ambiguous"), tools, scores([])).selectedFamilies).toContain("OTHER");
    expect(routeToolFamilies(state("find"), tools.slice(0, 2), scores([])).reason).toBe("NO_SAVINGS");
  });
  it("fails open when Jev fails and caches stable state", async () => {
    const failing: ToolRoutingJudge = { judge: async () => { throw new Error("offline"); } };
    expect((await new ToolRouter(failing, "active").route(state("find"), tools)).reason).toBe("JEV_FAILURE");
    let calls = 0;
    const judge: ToolRoutingJudge = { judge: async () => { calls++; return scores(["INSPECT", "SEARCH"]); } };
    const router = new ToolRouter(judge, "active");
    await router.route(state("find JWT"), tools); await router.route(state("find JWT"), tools); await router.route(state("find JWT", { obligations: ["run test"] }), tools);
    expect(calls).toBe(2);
  });
  it("observe mode computes without affecting its decision", async () => {
    const router = new ToolRouter({ judge: async () => scores(["WEB"]) }, "observe");
    const result = await router.route(state("research docs"), tools);
    expect(result.mode).toBe("ROUTED");
    expect(router.metrics().totalToolsHidden).toBeGreaterThan(0);
  });
});
