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
      // L6 (extensions/common's GOOD_CITIZEN.md).
      "extension-charter/no-direct-page-showing": "error",
    },
  },
  {
    // LP1 (README.md, "Live playback"): no schedule reads playback. The
    // card's own timers in src/components/ are L1's, not LP1's.
    files: ["src/**/*.{js,mjs,ts,tsx}"],
    ignores: ["src/components/**", "**/__tests__/**"],
    plugins: {
      "extension-charter": extensionCharterPlugin,
    },
    rules: {
      "extension-charter/no-playback-polling": "error",
    },
  },
  {
    // LP2: LIVE_PLAYBACK goes out only through the publisher's call.
    files: ["src/**/*.{js,mjs,ts,tsx}"],
    ignores: ["**/__tests__/**"],
    plugins: {
      "extension-charter": extensionCharterPlugin,
    },
    rules: {
      "extension-charter/message-sent-only-through": [
        "error",
        { type: "LIVE_PLAYBACK", through: "livePublisher" },
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
