import { noLocalPrimitive } from "@eslint/rules/index.js"
import { defineConfig } from "eslint/config"

/**
 * One owner per small primitive (U4, #2112). In maishatuRecommended, so every
 * preset carries it; extensions keep `@some-extension/common` as their owner.
 */
export const oneOwnerPlugin = {
  meta: { name: "one-owner", version: "0.0.1" },
  rules: {
    "no-local-primitive": noLocalPrimitive,
  },
}

export const primitiveOwners = {
  assertNever: [
    "packages/core-utils/src/lib/assert-never.ts",
    "extensions/common/src/utils/error.ts",
  ],
  isRecord: [
    "packages/core-utils/src/lib/is-record.ts",
    "extensions/common/src/utils/guards.ts",
  ],
}

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,tsx,cts,mts}"],
    ignores: ["**/*.test.*", "**/__tests__/**"],
    plugins: { "one-owner": oneOwnerPlugin },
    rules: {
      "one-owner/no-local-primitive": ["error", { owners: primitiveOwners }],
    },
  },
])
