import { noRawStorage } from "@eslint/rules/index.js"
import { defineConfig } from "eslint/config"

/**
 * KR1's guard (`apps/www/src/lib/kept-records`): in apps/www and
 * packages/ui, the page's storage is reached only through core-utils'
 * storage owner (`localStorageOrNull`, `sessionStorageOrNull`, and
 * `openKept`/`openRecord` to read a kept record), so no store reads one with
 * a parser of its own. The same rule as the extensions charter's, with a
 * remedy for this side; tests may touch storage directly.
 *
 *   import { keptRecordConfig } from "@some-ui/eslint-kit"
 *
 * In `uiRecommended`; apps/www adds it with its two exemptions, the
 * tenant adapter and the viewer's in-memory copies.
 */
export const keptRecordPlugin = {
  meta: { name: "kept-record", version: "0.0.1" },
  rules: {
    "no-raw-storage": noRawStorage,
  },
}

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx,cts,mts}"],
    ignores: [
      "**/*.test.*",
      "**/__tests__/**",
      "**/tests/**",
      "**/*.stories.*",
    ],
    plugins: { "kept-record": keptRecordPlugin },
    rules: {
      "kept-record/no-raw-storage": [
        "error",
        {
          remedy:
            "Use localStorageOrNull or sessionStorageOrNull from @some-ui/core-utils, and openKept/writeKept to read and write a kept record.",
        },
      ],
    },
  },
])
