import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("semantic-control held-out dataset", () => {
  it("has 120 uniquely identified and fully labeled cases", async () => {
    const file = resolve(import.meta.dirname, "../../../benchmarks/semantic-control/dataset/final-cases.jsonl");
    const cases = (await readFile(file, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as { id: string; expected: { decision: string; assessment: unknown } });
    expect(cases).toHaveLength(120);
    expect(new Set(cases.map((item) => item.id)).size).toBe(120);
    expect(new Set(cases.map((item) => item.expected.decision))).toEqual(new Set(["GO", "DELIBERATE", "VERIFY", "BLOCK"]));
  });
});
