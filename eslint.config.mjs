import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  { ignores: ["**/dist/**", "**/coverage/**", ".athena/**", "evals/fixtures/**", "bench/gold/**", "bench/validators/heldout/**", "bench/test/*.js", "packages/*/src/*.js", "packages/*/test/*.js", "vitest.config.js", "packages/opencode/src/rpc.d.ts"] },
  { rules: { "@typescript-eslint/no-explicit-any": "error" } },
);
