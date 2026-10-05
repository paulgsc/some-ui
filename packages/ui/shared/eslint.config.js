import {
  compiledPackageStyleImportBanPattern,
  reactImportBanSelectors,
  routerDynamicImportSelectors,
  routerImportBanPattern,
  themeProviderBanPattern,
  uiRecommended,
} from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

export default defineConfig([
  ...uiRecommended,
  {
    // Raw TS source with no build step: consumers' bundlers resolve its
    // imports, so a self-alias would need every consumer's config to know it,
    // and "../" stays the only safe form. The next block turns the rule back
    // on, without the "../" ban, for source files.
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    // Restates theme-protocol.config.ts's three bans (theme provider,
    // compiled style.css, router) for its files/ignores: flat config replaces
    // a rule's value wholesale, so the "off" above would drop them.
    files: ["**/*.{ts,tsx}"],
    ignores: [
      "**/*.stories.{ts,tsx}",
      "**/*.test.{ts,tsx}",
      "**/*.spec.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            themeProviderBanPattern,
            compiledPackageStyleImportBanPattern,
            routerImportBanPattern,
          ],
        },
      ],
    },
  },
  {
    // The dynamic-import half (react.config.ts's no-restricted-syntax):
    // restates the React-import and router bans, and deliberately omits
    // parentRelativeDynamicImportSelectors for the same "../" reason.

    files: ["**/*.{mdx,js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...reactImportBanSelectors,
        ...routerDynamicImportSelectors,
      ],
    },
  },
])
