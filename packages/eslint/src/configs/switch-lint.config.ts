import { defineConfig } from "eslint/config"

import { requireCaseBraces, requireFailFastDefault } from "../rules/index.js"

/**
 * Plugin housing switch-statement idiom rules: mandatory per-case block
 * scoping, and exhaustive-with-fail-fast `default` arms.
 */
export const switchLintPlugin = {
  meta: { name: "switch-lint", version: "0.0.1" },
  rules: {
    "require-case-braces": requireCaseBraces,
    "require-fail-fast-default": requireFailFastDefault,
  },
}

/**
 * Opt-in config — NOT included in maishatuRecommended/extensionsRecommended.
 * Spread it into a workspace's own eslint.config.js once you're ready:
 *
 *   import { switchLintConfig } from "@some-ui/eslint-kit"
 *   export default defineConfig([...maishatuRecommended, ...switchLintConfig])
 *
 * require-case-braces is a pure syntax transform and autofixable, so it's
 * safe to turn on and `--fix` immediately.
 *
 * require-fail-fast-default has no autofix — it would have to invent a
 * project-specific "assert never" helper — so expect to fix existing switch
 * defaults by hand before enabling it at "error". Configure `helperNames` to
 * match whatever helper your workspace actually exports, e.g.:
 *
 *   "switch-lint/require-fail-fast-default": [
 *     "error",
 *     { helperNames: ["assertNever"] },
 *   ]
 */
export default defineConfig([
  {
    files: ["**/*.{ts,tsx,cts,mts}"],
    plugins: { "switch-lint": switchLintPlugin },
    rules: {
      "switch-lint/require-case-braces": "error",
      "switch-lint/require-fail-fast-default": "error",
    },
  },
])
