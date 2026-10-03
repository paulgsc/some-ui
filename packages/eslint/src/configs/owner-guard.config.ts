import { noMountSnapshot } from "@eslint/rules/index.js"
import { defineConfig } from "eslint/config"

/**
 * `no-mount-snapshot`: a component or hook must not seed its state from a
 * prop or the clock, which freezes at mount a value its owner keeps
 * changing. See the rule's own header for what it reports and the three
 * ways out (derive at use, an `initial*` name, a reasoned disable for an
 * edit buffer keyed by what it edits).
 *
 * Opt-in, like intent-guard and query-guard: across the whole repo it
 * reports 60-odd sites, most of them deliberate (a store created once, an
 * edit buffer), in workspaces that never hit the bug. It is on where the
 * bug kept landing: #1659's review found the same stale copy five times in
 * aph, soundbites and www, one per round, and no check caught any of them.
 *
 *   import { ownerGuardConfig } from "@some-ui/eslint-kit"
 *   export default defineConfig([...uiRecommended, ...ownerGuardConfig])
 */
export const ownerGuardPlugin = {
  meta: { name: "owner-guard", version: "0.0.1" },
  rules: {
    "no-mount-snapshot": noMountSnapshot,
  },
}

export default defineConfig([
  {
    files: ["**/*.{ts,tsx,jsx}"],
    ignores: ["**/*.test.*", "**/__tests__/**", "**/*.stories.*"],
    plugins: { "owner-guard": ownerGuardPlugin },
    rules: {
      "owner-guard/no-mount-snapshot": "error",
    },
  },
])
