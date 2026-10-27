import { requireIgnoredReason } from "@eslint/rules/index.js"
import { defineConfig } from "eslint/config"

/**
 * FT2 (docs/monorepo-boundaries.md); see `require-ignored-reason.ts`. In
 * every preset, off in tests, whose catches are the test's own mechanics.
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
