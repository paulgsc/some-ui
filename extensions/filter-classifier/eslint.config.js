import {
  extensionsRecommended,
  reactImportBanSelectors,
} from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

export default defineConfig([
  ...extensionsRecommended,
  {
    // Standalone Playwright corpus/harness package with no build step or
    // bundler of its own (see package.json description) - source is
    // consumed directly by the Playwright/Storybook runners, not shipped as
    // a dist. A self-alias would need each of those runners' own config to
    // know about it, unlike a vite-built package (fetch-kit, speech, ws,
    // activity-catalog) where the alias is resolved away by `vite build`
    // before the dist ships. Until this package has a build step of its
    // own, "../" stays the only import form its own internals can safely
    // use.
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    // Same "raw source, no self-alias" reasoning as the no-restricted-imports
    // override above, applied to the dynamic-import half of the rule
    // (react.config.ts's no-restricted-syntax - see its own doc comment for
    // why it lives there). Redeclares the React-import-ban selectors instead
    // of dropping them: flat config replaces this rule's value wholesale, so
    // omitting them would silently disable that unrelated check too.
    files: ["**/*.{mdx,js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...reactImportBanSelectors],
    },
  },
])
