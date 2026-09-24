import { TypeSafeClient, noul } from "@typesafe-ai/sdk";
import type { ToolFamily, ToolRoutingJudge, ToolRoutingState } from "@athena/core";

function parse(value: unknown, families: readonly ToolFamily[]): Partial<Record<ToolFamily, number>> {
  const answers = (value as { answers?: Record<string, { noul?: unknown }> }).answers;
  if (!answers) throw new Error("TypeSafe returned malformed tool routing response");
  const result: Partial<Record<ToolFamily, number>> = {};
  for (const family of families) {
    const probability = answers[family]?.noul;
    if (typeof probability !== "number" || probability < 0 || probability > 1) throw new Error("TypeSafe returned malformed tool routing response");
    result[family] = probability;
  }
  return result;
}

/** Host-independent Jev semantic layer. It receives only compact redacted state. */
export class TypeSafeToolRoutingJudge implements ToolRoutingJudge {
  private readonly client: TypeSafeClient;
  /** Typed provider output from the most recent call, for sanitized evaluation logs. */
  latestRawTypedOutput: unknown | undefined;
  constructor(timeout = 2500, client?: TypeSafeClient) {
    if (!process.env.TYPESAFE_API_KEY && !client) throw new Error("TYPESAFE_API_KEY is missing");
    this.client = client ?? new TypeSafeClient({ timeout });
  }
  async judge(state: ToolRoutingState, families: readonly ToolFamily[]): Promise<Partial<Record<ToolFamily, number>>> {
    const questions = Object.fromEntries(families.map((family) => [family, noul(`Is access to ${family} necessary or strongly relevant before the agent can make reliable progress on its current next meaningful objective? Do not select it merely because it could become useful in a later task step. Preserve it when the compact state makes its relevance genuinely uncertain. This is capability routing, not an action decision.`)]));
    const rawTypedOutput = await this.client.systemOne({ state: JSON.stringify({ kind: "athena-tool-routing", state }), questions });
    this.latestRawTypedOutput = rawTypedOutput;
    return parse(rawTypedOutput, families);
  }
}
