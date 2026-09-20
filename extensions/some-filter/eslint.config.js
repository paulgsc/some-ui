import { extensionsRecommended } from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

/**
 * Point the Charter's §5 lifetime rule at this workspace's own lifecycle
 * helper, so the error names the thing the author should reach for.
 *
 * A named Charter rule rather than a local `no-restricted-syntax` entry, and
 * that is not incidental: `no-restricted-syntax` options do not merge, so a
 * workspace-level entry silently replaces
 * `extensions-security.config.ts`'s own selectors — the exact hazard that
 * file's header warns about. A named rule cannot be clobbered that way.
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
    // swatches/ is a documented cross-package leaf (see the file's own
    // header comment): filter-classifier imports it directly through
    // @some-extension/filter's "./*" raw-source export for its own
    // typecheck/bundling, so `@filter/*` - which only resolves inside this
    // package's own tsconfig - would break that consumer. Same category as
    // extensions/transport's adapter/ carve-out.
    files: ["src/adapter/swatches/**/*.{ts,tsx,cts,mts}"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
])
