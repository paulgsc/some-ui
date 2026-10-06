import someUIEslint, { reactImportBanSelectors } from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

export default defineConfig([
  ...someUIEslint,
  {
    // Raw TS source with no build step: consumers' bundlers resolve its
    // imports, so a self-alias would need every consumer's config to know
    // it. "../" stays the only safe form.
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    // The same for the dynamic-import half (react.config.ts's
    // no-restricted-syntax). Flat config replaces the rule's value wholesale,
    // so the React-import-ban selectors are redeclared, not dropped.

    files: ["**/*.{mdx,js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...reactImportBanSelectors],
    },
  },
])
