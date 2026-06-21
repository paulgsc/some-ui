import { fixupPluginRules } from "@eslint/compat"
import type { FixupPluginDefinition } from "@eslint/compat"
import tailwindPlugin from "eslint-plugin-tailwindcss"
import { defineConfig } from "eslint/config"

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const tailwindPluginFixed = tailwindPlugin as unknown as FixupPluginDefinition

export default defineConfig([
  {
    plugins: {
      // eslint-plugin-tailwindcss v4 types rules with @typescript-eslint/utils RuleModule,
      // which conflicts with ESLint v10's RuleDefinition. fixupPluginRules bridges the gap
      // at both runtime and type level.
      tailwindcss: fixupPluginRules(tailwindPluginFixed),
    },
    settings: {
      tailwindcss: {
        callees: ["cn", "cva"],
      },
    },
    rules: {
      "tailwindcss/classnames-order": "warn",
      "tailwindcss/enforces-negative-arbitrary-values": "warn",
      "tailwindcss/enforces-shorthand": "warn",
      "tailwindcss/no-custom-classname": "warn",
      "tailwindcss/no-contradicting-classname": "error",
      "tailwindcss/no-unnecessary-arbitrary-value": "error",
    },
  },
])
