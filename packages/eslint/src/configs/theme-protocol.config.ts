import {
  noStructuralPaletteColor,
  noThemeBoundary,
} from "@eslint/rules/index.js"
import { defineConfig } from "eslint/config"
import type { Config } from "typescript-eslint"

import { parentRelativeImportPattern } from "./base.config.js"

/**
 * Plugin enforcing the theme protocol (`@some-ui/styles/theme`) at the one
 * boundary nothing could check before: reusable UI source.
 *
 * The design system already owned the token values and the host already owned
 * the DOM boundary. What was missing was a statement of how a *component* is
 * allowed to express theme-dependent visual intent — so components variously
 * mounted their own full palette (`dark code` on leetype's root, `dark topik`
 * on the study session) or bypassed tokens with literal grays. Both are
 * invisible in review and neither fails a build; the session theme changed and
 * those subtrees did not follow.
 */
export const themeProtocolPlugin = {
  meta: { name: "theme-protocol", version: "0.0.1" },
  rules: {
    "no-theme-boundary": noThemeBoundary,
    "no-structural-palette-color": noStructuralPaletteColor,
  },
}

/**
 * Scoped to reusable UI, and applied by `uiRecommended` rather than by the
 * base preset. An app or a story is a *host*: choosing a feature appearance
 * for a surface it owns is exactly the opt-in this protocol asks for, so
 * `.storybook` wrappers and apps/www routes are deliberately out of scope.
 *
 * Globs are workspace-relative because every workspace runs ESLint from its
 * own directory.
 */
export default defineConfig([
  {
    files: ["**/*.{ts,tsx}"],
    ignores: [
      "**/*.stories.{ts,tsx}",
      "**/*.test.{ts,tsx}",
      "**/*.spec.{ts,tsx}",
    ],
    plugins: { "theme-protocol": themeProtocolPlugin },
    rules: {
      "theme-protocol/no-theme-boundary": "error",
      "theme-protocol/no-structural-palette-color": "error",
      // A package reaching into an app's theme provider is the coupling this
      // whole architecture exists to prevent — and it would not even work,
      // since the protocol is CSS inheritance and has nothing to subscribe to.
      // Restates base.config.ts's parent-relative-import ban alongside the
      // theme-provider ban below: this config is spread after
      // maishatuRecommended in `uiRecommended`, and flat config replaces (not
      // merges) a rule's value at the most specific matching config - so
      // without it, this block would silently turn the base ban off for
      // every non-story/test/spec .ts/.tsx file in every package/ui/*
      // workspace.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            parentRelativeImportPattern,
            {
              group: ["**/apps/www/**", "@/providers/theme"],
              message:
                "Reusable UI must not import an app's theme provider. Theme reaches components by CSS inheritance from the host's DOM boundary — there is nothing to subscribe to. If you need the registry itself, import @some-ui/styles/theme.",
            },
          ],
        },
      ],
    },
  },
])

/**
 * A ratchet for source whose structural colors have not been migrated yet.
 *
 * Deliberately narrow: it turns off **only** the color rule, and only for the
 * globs handed to it. `no-theme-boundary` — the failure users actually
 * reported, and the one the whole repo is clean of as of this landing — stays
 * on everywhere with no exceptions.
 *
 * The split is because the two checks cost different things to satisfy. A
 * boundary violation has one correct fix (take an `appearance` prop, default
 * it to "inherit"). A structural color needs a per-call judgment about which
 * role the literal was standing in for — substrate, text tier, outline — and
 * that judgment is the work. The first pass covered apps/www's dependency
 * closure, which is every component a user can currently reach; everything
 * else opts in here until someone does the same reading for it.
 *
 * Each caller lives in the unmigrated package's own `eslint.config.js`, so
 * the exception is in front of whoever next edits that package rather than in
 * a central list nobody reads. Delete the call to migrate.
 */
export function structuralColorRatchet(
  globs: Array<string> = ["**/*.{ts,tsx}"]
): Config {
  return defineConfig([
    {
      files: globs,
      rules: { "theme-protocol/no-structural-palette-color": "off" },
    },
  ])
}
