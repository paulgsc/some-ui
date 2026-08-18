import { extensionsRecommended } from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

export default defineConfig([
  ...extensionsRecommended,
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
