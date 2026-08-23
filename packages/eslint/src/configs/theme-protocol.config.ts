import {
  noStructuralPaletteColor,
  noThemeBoundary,
} from "@eslint/rules/index.js"
import { defineConfig } from "eslint/config"
import type { Config } from "typescript-eslint"

import { parentRelativeImportPattern } from "./base.config.js"
import { compiledPackageStyleImportBanPattern } from "./style-import-protocol.config.js"

/**
 * Exported so a workspace that must turn off the parent-relative-import ban
 * below (a raw-source package with no self-alias - see base.config.ts's
 * `no-restricted-imports` for the full rationale) can redeclare
 * `no-restricted-imports` with just this pattern, instead of silently
 * dropping the theme-provider ban too. Flat config replaces a rule's value
 * wholesale at the most specific matching config; there is no way to remove
 * one pattern from this list without restating the rest.
 */
export const themeProviderBanPattern = {
  group: ["**/apps/www/**", "@/providers/theme"],
  message:
    "Reusable UI must not import an app's theme provider. Theme reaches components by CSS inheritance from the host's DOM boundary — there is nothing to subscribe to. If you need the registry itself, import @some-ui/styles/theme.",
}

/**
 * Same boundary, a different plumbing concern: a route's URL, query params,
 * and navigation are host-specific state, not something a reusable
 * component under packages/ui/* gets to reach for directly. The whole point
 * of this workspace boundary is that the same component stays mountable
 * from any client — this app today, a different TanStack app, a Next.js
 * app, or anything else tomorrow — each passing its own routing concerns
 * down as granular props/context instead of the component importing a
 * router and coupling itself to one framework's navigation model
 * (paulgsc/some-ui#1146's postmortem, on why "an app only owns concerns
 * that are a necessary part of its own plumbing" needed to become a rule
 * rather than stay a convention).
 */
export const routerImportBanPattern = {
  group: [
    "@tanstack/react-router",
    "@tanstack/react-router-devtools",
    "next",
    "next/*",
    "react-router",
    "react-router-dom",
  ],
  message:
    "Reusable UI must not import a router or framework-navigation package. Accept route/query/navigation state as props or context from the host instead — a component under packages/ui/* must stay mountable from any client, and importing a router directly ties it to one.",
}

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
      // theme-provider, style-import, and router bans below: this config is
      // spread after maishatuRecommended in `uiRecommended`, and flat config
      // replaces (not merges) a rule's value at the most specific matching
      // config - so without restating all four here, this block would
      // silently turn the others off for every non-story/test/spec .ts/.tsx
      // file in every package/ui/* workspace. This array is now the one
      // place that answers "what may a reusable UI workspace not import" —
      // despite the file's name, it is the packages/ui/* host-boundary
      // array, not only the theme half of it.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            parentRelativeImportPattern,
            themeProviderBanPattern,
            compiledPackageStyleImportBanPattern,
            routerImportBanPattern,
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
