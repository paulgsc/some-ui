import { fixupConfigRules } from "@eslint/compat"
import type { FixupConfigArray } from "@eslint/compat"
import { preferMetaSatisfies } from "@eslint/rules/index.js"
import storybook from "eslint-plugin-storybook"
import { defineConfig } from "eslint/config"

/**
 * Plugin housing story-file-specific autofix rules. Kept separate from
 * eslint-plugin-storybook's own "storybook" plugin namespace to avoid
 * colliding with its rule keys.
 */
export const storyLintPlugin = {
  meta: { name: "story-lint", version: "0.0.1" },
  rules: {
    "prefer-meta-satisfies": preferMetaSatisfies,
  },
}

export default defineConfig([
  // storybook@10 uses @typescript-eslint/utils RuleModule types (ESLint v8/v9 signatures).
  // fixupConfigRules wraps each rule's create() to fill the deprecated context methods
  // that ESLint v10 removed, keeping runtime behavior and type-checker aligned.
  ...fixupConfigRules(
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    storybook.configs["flat/recommended"] as unknown as FixupConfigArray
  ),
  {
    files: ["**/*.stories.tsx"],
    plugins: {
      "story-lint": storyLintPlugin,
    },
    rules: {
      "import/no-anonymous-default-export": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      // Autofixes `export default { ... } as Meta` (banned by
      // @typescript-eslint/consistent-type-assertions, assertionStyle: "never")
      // to `const meta = { ... } satisfies Meta` + `export default meta`.
      "story-lint/prefer-meta-satisfies": "error",
    },
  },
])
