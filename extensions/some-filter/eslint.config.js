import { extensionsRecommended } from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

/**
 * Point the Charter's §5 lifetime rule at this workspace's own lifecycle
 * helper, so the error names the thing the author should reach for.
 *
 * A named Charter rule, not a local `no-restricted-syntax` entry: those
 * options do not merge, so a workspace entry would silently replace
 * `extensions-security.config.ts`'s selectors.
 */
const namedLifetime = {
  files: ["src/**/*.{ts,tsx}"],
  rules: {
    "extension-charter/require-named-lifetime": [
      "error",
      { lifecycleModule: "lib/content/visibility-gate.ts" },
    ],
  },
}

export default defineConfig([
  ...extensionsRecommended,
  namedLifetime,
  {
    // swatches/ is a cross-package leaf (see its header): filter-classifier
    // imports it through the "./*" raw-source export, where `@filter/*` does
    // not resolve. Same category as extensions/transport's adapter/ carve-out.
    files: ["src/adapter/swatches/**/*.{ts,tsx,cts,mts}"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
])
