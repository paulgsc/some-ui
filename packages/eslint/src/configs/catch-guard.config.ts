import { requireIgnoredReason } from "@eslint/rules/index.js"
import { defineConfig } from "eslint/config"

/**
 * `require-ignored-reason` (invariant FT2, docs/monorepo-boundaries.md): a
 * catch that drops its error with no statement carries an `Ignored:` line
 * saying why. In every preset, on everything but tests, whose catches are
 * the test's own mechanics.
 */
export const catchGuardPlugin = {
  meta: { name: "catch-guard", version: "0.0.1" },
  rules: {
    "require-ignored-reason": requireIgnoredReason,
  },
}

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx,mts,cts,jsx}"],
    ignores: [
      "**/*.test.*",
      "**/*.spec.*",
      "**/__tests__/**",
      "**/tests/**",
      "**/e2e/**",
    ],
    plugins: { "catch-guard": catchGuardPlugin },
    rules: {
      "catch-guard/require-ignored-reason": "error",
    },
  },
])
