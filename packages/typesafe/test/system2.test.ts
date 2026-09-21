import { describe, expect, it } from "vitest";
import { buildCognitiveWorldState, buildDeliberationRequest, type CognitiveAssessment, type CognitivePolicyResult } from "@athena/core";
import { OpenAICompatibleSystem2Bridge, System2ProviderError } from "../src/index.js";

const policy: CognitivePolicyResult = { decision: "DELIBERATE", reasons: ["PERSISTENT_STAGNATION"], policyVersion: "0.3.0", triggeredRules: ["stagnation"], temporalEvidence: { consecutiveLowProgress: 3, consecutiveLowInformationGain: 3, consecutiveHighStagnation: 3 } };
const assessment = { safety: { failureProbability: 0.1, impactSeverity: 0.1, irreversibility: 0.1, policyViolationProbability: 0.1 }, progress: { progressProbability: 0.1, informationGainProbability: 0.1, strategyNovelty: 0.1, stagnationProbability: 0.9, goalAlignment: 0.9 }, completion: { goalSatisfiedProbability: 0.1, evidenceCoverage: 0.1, unresolvedObligationsProbability: 0.9 }, epistemics: { stateUncertainty: 0.1, contextSufficiency: 0.9, contradictionProbability: 0.1 } } as unknown as CognitiveAssessment;
const request = () => buildDeliberationRequest("r", policy, buildCognitiveWorldState({ goal: { goalId: "g", description: "fix auth" }, candidate: { id: "c", kind: "tool", tool: "test", intent: "rerun test" }, recentActions: [], recentStrategies: [{ strategyId: "rerun", intent: "fix auth", approach: "rerun test" }], unresolvedObligations: [], environment: { availableCapabilities: ["test"] } }), assessment);
const config = { apiKey: "test-key", baseUrl: "https://example.test/v1", model: "test-model", timeoutMs: 1000 };

describe("OpenAI-compatible System 2 bridge", () => {
  it("uses only privileged system context and owns structured output", async () => {
    let body = ""; const raw = { choices: [{ message: { content: JSON.stringify({ requestId: "r", candidateId: "c", revisedStrategy: { strategyId: "inspect", intent: "inspect expiry", approach: "inspect expiration calculation", supersedesStrategyId: "rerun" } }) } }] };
    const bridge = new OpenAICompatibleSystem2Bridge(config, async (_url, init) => { body = String(init.body); return { ok: true, status: 200, json: async () => raw }; });
    const result = await bridge.deliberate(request()); raw.choices[0]!.message.content = "{}";
    expect(JSON.parse(body).messages).toEqual([expect.objectContaining({ role: "system" })]);
    expect(body).not.toContain('"role":"user"');
    expect(result.revisedStrategy.approach).toBe("inspect expiration calculation");
  });

  it("rejects provider reasoning fields and transport failures", async () => {
    const reasoning = new OpenAICompatibleSystem2Bridge(config, async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ requestId: "r", candidateId: "c", revisedStrategy: { strategyId: "s", intent: "i", approach: "a" }, reasoningTrace: "hidden" }) } }] }) }));
    await expect(reasoning.deliberate(request())).rejects.toBeInstanceOf(System2ProviderError);
    const broken = new OpenAICompatibleSystem2Bridge(config, async () => { throw new Error("network"); });
    await expect(broken.deliberate(request())).rejects.toMatchObject({ category: "TRANSPORT" });
  });

  it("rejects invalid model configuration", () => {
    expect(() => new OpenAICompatibleSystem2Bridge({ ...config, timeoutMs: 0 })).toThrow(System2ProviderError);
  });
});
