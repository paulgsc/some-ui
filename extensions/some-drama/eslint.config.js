import {
  extensionCharterPlugin,
  extensionsRecommended,
} from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

export default defineConfig(
  ...extensionsRecommended,
  {
    // Charter §8, at error rather than the shared config's audit-level warn:
    // this workspace acquires page listeners and frame loops through
    // @some-extension/common's Disposables, so an unscoped one is a
    // regression, not debt. (It was the workspace the rule was written for.)
    files: ["**/*.{js,mjs,ts,tsx}"],
    plugins: {
      "extension-charter": extensionCharterPlugin,
    },
    rules: {
      "extension-charter/require-scoped-lifetime": [
        "error",
        { lifecycleModule: "@some-extension/common's Disposables" },
      ],
    },
  },
  {
    files: ["src/logic/**/*.{js,mjs,ts,tsx}"],
    plugins: {
      "extension-charter": extensionCharterPlugin,
    },
    rules: {
      "extension-charter/no-logic-layer-side-effects": "error",
    },
  }
)
