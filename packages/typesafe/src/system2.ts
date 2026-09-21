import { System2DeliberationError, assertSystem2DeliberationResult, renderDeliberationContext, type DeliberationRequest, type System2Bridge, type System2DeliberationResult } from "@athena/core";

export interface System2ModelConfig { readonly apiKey: string; readonly baseUrl: string; readonly model: string; readonly timeoutMs: number; }
export interface System2FetchResponse { readonly ok: boolean; readonly status: number; json(): Promise<unknown>; }
export type System2Fetch = (input: string, init: RequestInit) => Promise<System2FetchResponse>;

export class System2ProviderError extends Error { constructor(readonly category: "CONFIGURATION" | "TRANSPORT" | "INVALID_RESPONSE") { super(`System 2 ${category.toLowerCase()} failure`); this.name = "System2ProviderError"; } }

export function system2ModelConfigFromEnvironment(environment: NodeJS.ProcessEnv = process.env): System2ModelConfig {
  const apiKey = environment.ATHENA_SYSTEM2_API_KEY ?? environment.OPENAI_API_KEY;
  const model = environment.ATHENA_SYSTEM2_MODEL ?? environment.OPENAI_MODEL;
  if (!apiKey || !model) throw new System2ProviderError("CONFIGURATION");
  const baseUrl = environment.ATHENA_SYSTEM2_BASE_URL ?? "https://api.openai.com/v1";
  const timeoutMs = Number(environment.ATHENA_SYSTEM2_TIMEOUT_MS ?? "30000");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) throw new System2ProviderError("CONFIGURATION");
  return Object.freeze({ apiKey, baseUrl: baseUrl.replace(/\/$/, ""), model, timeoutMs });
}

function validConfig(config: System2ModelConfig): System2ModelConfig { if (!config.apiKey || !config.baseUrl || !config.model || !Number.isInteger(config.timeoutMs) || config.timeoutMs < 1000 || config.timeoutMs > 120000) throw new System2ProviderError("CONFIGURATION"); return Object.freeze({ ...config, baseUrl: config.baseUrl.replace(/\/$/, "") }); }

function schema() { return { type: "json_schema", json_schema: { name: "athena_system2_deliberation", strict: true, schema: { type: "object", additionalProperties: false, required: ["requestId", "candidateId", "revisedStrategy"], properties: { requestId: { type: "string" }, candidateId: { type: "string" }, revisedStrategy: { type: "object", additionalProperties: false, required: ["strategyId", "intent", "approach"], properties: { strategyId: { type: "string" }, intent: { type: "string" }, approach: { type: "string" }, hypothesisId: { type: "string" }, target: { type: "string" }, supersedesStrategyId: { type: "string" }, changeSummary: { type: "string" } } }, candidateAction: { type: "object", additionalProperties: false, required: ["id", "kind", "intent"], properties: { id: { type: "string" }, kind: { type: "string", enum: ["tool", "answer", "complete"] }, tool: { type: "string" }, input: { type: "string" }, intent: { type: "string" }, expectedObservation: { type: "string" }, hypothesisId: { type: "string" } } } } } } }; }

function content(value: unknown): unknown {
  if (typeof value !== "object" || value === null) throw new System2ProviderError("INVALID_RESPONSE");
  const message = (value as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
  if (typeof message !== "string") throw new System2ProviderError("INVALID_RESPONSE");
  try { return JSON.parse(message); } catch { throw new System2ProviderError("INVALID_RESPONSE"); }
}

export class OpenAICompatibleSystem2Bridge implements System2Bridge {
  private readonly config: System2ModelConfig;
  constructor(config: System2ModelConfig, private readonly fetcher: System2Fetch = fetch) { this.config = validConfig(config); }
  async deliberate(request: DeliberationRequest): Promise<System2DeliberationResult> {
    const context = renderDeliberationContext(request);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetcher(`${this.config.baseUrl}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${this.config.apiKey}` }, signal: controller.signal, body: JSON.stringify({ model: this.config.model, messages: [{ role: "system", content: `${context.text}\nReturn only schema-constrained JSON. Do not provide reasoning.` }], response_format: schema(), temperature: 0 }) });
      if (!response.ok) throw new System2ProviderError("TRANSPORT");
      try { return assertSystem2DeliberationResult(content(await response.json())); } catch (error) { if (error instanceof System2ProviderError) throw error; throw new System2ProviderError("INVALID_RESPONSE"); }
    } catch (error) {
      if (controller.signal.aborted) throw new System2DeliberationError("System 2 timeout");
      if (error instanceof System2ProviderError || error instanceof System2DeliberationError) throw error;
      throw new System2ProviderError("TRANSPORT");
    } finally { clearTimeout(timer); }
  }
}
