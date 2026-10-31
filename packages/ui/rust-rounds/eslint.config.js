import {
  compiledPackageStyleImportBanPattern,
  parentRelativeImportPattern,
  routerImportBanPattern,
  themeProviderBanPattern,
  uiRecommended,
} from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

// Rust Rounds and LeetType may share infrastructure, never product logic
// (the owner, paulgsc/some-ui#2231): a grade, a struggle or a park has no
// place here. Anything both need lives in a neutral workspace.
const notLeetypePattern = {
  regex: "^@some-ui/leetype(/|$)",
  message:
    "Rust Rounds never imports LeetType (#2231). Move what both need to a neutral workspace (packages/ui/shared, packages/core-utils) and import it from there.",
}

const TESTS = ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"]

export default defineConfig([
  ...uiRecommended,

  // Flat config replaces this rule's options wholesale, so each block
  // restates what the preset sets for the same files: theme-protocol's four
  // patterns for source, base.config.ts's `../` ban for tests.
  {
    files: ["**/*.{ts,tsx}"],
    ignores: TESTS,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            parentRelativeImportPattern,
            themeProviderBanPattern,
            compiledPackageStyleImportBanPattern,
            routerImportBanPattern,
            notLeetypePattern,
          ],
        },
      ],
    },
  },
  {
    files: TESTS,
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [parentRelativeImportPattern, notLeetypePattern] },
      ],
    },
  },
])
