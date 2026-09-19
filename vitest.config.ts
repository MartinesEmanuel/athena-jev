import { defineConfig } from "vitest/config";
import { join } from "node:path";
export default defineConfig({ resolve: { alias: { "@athena/core": join(process.cwd(), "packages/core/src/index.ts"), "@athena/typesafe": join(process.cwd(), "packages/typesafe/src/index.ts"), "@athena/agent-sdk": join(process.cwd(), "packages/agent-sdk/src/index.ts"), "@athena/codex": join(process.cwd(), "packages/codex/src/index.ts"), "@athena/cursor": join(process.cwd(), "packages/cursor/src/index.ts") } }, test: { include: ["packages/*/test/**/*.test.ts", "bench/test/**/*.test.ts"] } });
