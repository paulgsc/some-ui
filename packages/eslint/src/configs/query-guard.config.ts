import { noLoadingElidedDefault } from "@eslint/rules/index.js"
import { defineConfig } from "eslint/config"

/**
 * #968/MS8: `no-loading-elided-default` is the lint half of the
 * route-arrival invariant's dashboard finding - a query hook's `data`
 * destructured with a default value, with no sibling `isLoading`/
 * `isPending`/`isError`/`error`/`status` read in the same statement, so a
 * pending or failed read is indistinguishable from a genuine empty result.
 * See that rule's own header for what it does and does not catch - notably
 * *not* the sibling `if (isLoading || !data)` skeleton-forever family (no
 * default value there to key off), which the route-arrival handoff's
 * `query-outcome` module and its call sites address instead.
 *
 * Opt-in config, following intent-guard.config.ts's precedent - not folded
 * into a shared preset, since a query-hook-shaped destructure is an
 * `apps/www` convention, not something every workspace has. Shipped at
 * `warn` per #968's own instruction: this is a real, repo-wide pattern
 * (`app.tsx` had it pre-fix) and a first pass may still surface call sites
 * nobody has looked at yet.
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
