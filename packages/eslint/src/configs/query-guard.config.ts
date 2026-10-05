import { noLoadingElidedDefault } from "@eslint/rules/index.js"
import { defineConfig } from "eslint/config"

/**
 * `no-loading-elided-default` (#968): a query hook's `data` destructured with
 * a default and no sibling loading/error state, so a pending or failed read
 * looks like an empty result. See the rule's header for what it does not
 * catch (`query-outcome` covers that).
 *
 * Opt-in, like intent-guard: the destructure shape is an `apps/www`
 * convention. Shipped at `warn`: a first pass may surface unexamined sites.
 *
 *   import { queryGuardConfig } from "@some-ui/eslint-kit"
 *   export default defineConfig([...appsRecommended, ...queryGuardConfig])
 */
export const queryGuardPlugin = {
  meta: { name: "query-guard", version: "0.0.1" },
  rules: {
    "no-loading-elided-default": noLoadingElidedDefault,
  },
}

export default defineConfig([
  {
    files: ["**/*.{ts,tsx,jsx}"],
    plugins: { "query-guard": queryGuardPlugin },
    rules: {
      "query-guard/no-loading-elided-default": "warn",
    },
  },
])
