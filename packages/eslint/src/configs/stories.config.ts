// eslint-disable-next-line import/no-extraneous-dependencies
import { fixupConfigRules } from "@eslint/compat"
import type { FixupConfigArray } from "@eslint/compat"
// eslint-disable-next-line import/no-extraneous-dependencies
import storybook from "eslint-plugin-storybook"
import { defineConfig } from "eslint/config"

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
    rules: {
      "import/no-anonymous-default-export": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },
])
