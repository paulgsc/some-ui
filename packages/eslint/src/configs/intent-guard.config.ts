import { defineConfig } from "eslint/config"

import { noUnboundedIntent } from "../rules/index.js"

/**
 * S1 of #937: the lint half of the intent boundary. The type layer
 * (`matchIntent`'s required arms, `@typescript-eslint/switch-exhaustiveness-check`)
 * cannot see that `onClick={() => { void fetch(...) }}` bypasses `useIntent`
 * entirely - nothing about that expression is ill-typed. This plugin's one
 * rule, `no-unbounded-intent`, catches exactly that boundary crossing: an
 * effect (`fetch`, `.mutate`, `.mutateAsync`, or a configured member call)
 * initiated from inside a JSX event-handler producer without going through
 * `useIntent`/`useAsyncIntent`'s `start`/`retry`.
 *
 * Opt-in config, following switch-lint.config.ts's precedent - NOT included
 * in maishatuRecommended/appsRecommended/extensionsRecommended. Folding it
 * into a shared preset would fire it across `extensions/` and every
 * `packages/ui/*`, which have their own charters and no `useIntent` of
 * their own. Enable it per-workspace once that workspace actually has an
 * intent boundary to guard:
 *
 *   import { intentGuardConfig } from "@some-ui/eslint-kit"
 *   export default defineConfig([...appsRecommended, ...intentGuardConfig])
 *
 * No autofix - the correct repair is a design decision about what the user
 * sees on failure, and a codemod that invents a `useIntent` call site would
 * have to guess at that decision.
 */
export const intentGuardPlugin = {
  meta: { name: "intent-guard", version: "0.0.1" },
  rules: {
    "no-unbounded-intent": noUnboundedIntent,
  },
}

export default defineConfig([
  {
    files: ["**/*.{ts,tsx,jsx}"],
    plugins: { "intent-guard": intentGuardPlugin },
    rules: {
      "intent-guard/no-unbounded-intent": "error",
    },
  },
])
