import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../..", import.meta.url);
const text = (path: string) => readFile(new URL(path, root), "utf8");

describe("Harbor/Modal pinned agent contract", () => {
  it("pins source OpenCode, Bun integrity, and the official patch location", async () => {
    const agent = await text("benchmarks/swebench-pro-v2/harbor/athena_opencode.py");
    expect(agent).toContain('OPENCODE_COMMIT = "08462140ec0de1e4b17d4a353d8d5827f53cf7b0"');
    expect(agent).toContain('BUN_VERSION = "1.4.2"');
    expect(agent).toContain("bun install --frozen-lockfile");
    expect(agent).toContain("/logs/agent/model.patch");
  });

  it("keeps baseline free of ATHENA state and requires it for full", async () => {
    const agent = await text("benchmarks/swebench-pro-v2/harbor/athena_opencode.py");
    expect(agent).toContain('Literal["baseline", "athena_full"]');
    expect(agent).toContain('ATHENA_FULL requires a prebuilt ATHENA bundle and exact ATHENA SHA');
    expect(agent).toContain('"athenaInstalled": self._condition == "athena_full"');
    expect(agent).toContain('"ATHENA_STATE_ROOT"] = "/logs/agent/athena-state"');
  });

  it("records only the session model identity exposed by this host", async () => {
    const frozen = JSON.parse(await text("benchmarks/swebench-pro-v2/frozen-experiment.json"));
    expect(frozen.codingModel).toEqual(expect.objectContaining({ provider: "openai", modelId: "gpt-5.6-terra", reasoningEffort: "medium" }));
    expect(frozen.codingModel.temperature).toBe("NOT_CONFIGURABLE");
  });
});
