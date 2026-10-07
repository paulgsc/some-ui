import {
  noFixedStatusColor,
  noStructuralPaletteColor,
  noThemeBoundary,
} from "@eslint/rules/index.js"
import type { Linter } from "eslint"
import { defineConfig } from "eslint/config"

import { parentRelativeImportPattern } from "./base.config.js"
import {
  parentRelativeDynamicImportSelectors,
  reactImportBanSelectors,
} from "./react.config.js"
import { compiledPackageStyleImportBanPattern } from "./style-import-protocol.config.js"

/**
 * Exported so a raw-source workspace that turns off the parent-relative-import
 * ban (see base.config.ts) can redeclare `no-restricted-imports` with this
 * pattern: flat config replaces a rule's value wholesale, so one pattern
 * cannot be removed without restating the rest.
 */
export const themeProviderBanPattern = {
  group: ["**/apps/www/**", "@/providers/theme"],
  message:
    "Reusable UI must not import an app's theme provider. Theme reaches components by CSS inheritance from the host's DOM boundary — there is nothing to subscribe to. If you need the registry itself, import @some-ui/styles/theme.",
}

/**
 * Same boundary, a different plumbing concern: routing is host state. A
 * component under packages/ui/* stays mountable from any client, each
 * passing its routing concerns down as props/context, instead of importing
 * a router and coupling to one framework (#1146).
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
 * `no-restricted-imports` sees only static imports, not `ImportExpression`,
 * so the dynamic half is declared separately (as with react.config.ts's
 * `parentRelativeDynamicImportSelectors`).
 */
export const routerDynamicImportSelectors = [
  {
    selector:
      "ImportExpression[source.value=/^(@tanstack\\/react-router(-devtools)?|next(\\/.*)?|react-router(-dom)?)$/]",
    message:
      "Reusable UI must not import a router or framework-navigation package, including via a dynamic import() — see routerImportBanPattern.",
  },
]

/**
 * Plugin enforcing the theme protocol (`@some-ui/styles/theme`) at the one
 * boundary nothing could check before: reusable UI source.
 *
 * It states how a *component* may express theme-dependent intent. Without
 * it, components mounted their own palette (`dark code` on a root) or used
 * literal grays, invisible in review, and those subtrees ignored the session
 * theme.
 */
export const themeProtocolPlugin = {
  meta: { name: "theme-protocol", version: "0.0.1" },
  rules: {
    "no-theme-boundary": noThemeBoundary,
    "no-structural-palette-color": noStructuralPaletteColor,
    "no-fixed-status-color": noFixedStatusColor,
  },
}

/**
 * Scoped to reusable UI, and applied by `uiRecommended` rather than by the
 * base preset. An app is a *host*: choosing a feature appearance for a
 * surface it owns is exactly the opt-in this protocol asks for, so apps/www
 * routes are deliberately out of scope.
 *
 * Globs are workspace-relative because every workspace runs ESLint from its
 * own directory.
 */
export default defineConfig([
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    plugins: { "theme-protocol": themeProtocolPlugin },
    rules: {
      "theme-protocol/no-theme-boundary": "error",
      "theme-protocol/no-structural-palette-color": "error",
      "theme-protocol/no-fixed-status-color": "error",
      // The one place that answers "what may a reusable UI workspace not
      // import". A package reaching into an app's theme provider is the
      // coupling this architecture prevents (and the protocol is CSS
      // inheritance, with nothing to subscribe to). Flat config replaces a
      // rule's value at the most specific match, so base.config.ts's
      // parent-relative ban is restated with the other three.
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
      // Likewise for the dynamic-import half: react.config.ts's global
      // `no-restricted-syntax` selectors are restated alongside
      // routerDynamicImportSelectors, or this block would replace them.
      "no-restricted-syntax": [
        "error",
        ...reactImportBanSelectors,
        ...parentRelativeDynamicImportSelectors,
        ...routerDynamicImportSelectors,
      ],
    },
  },
])

/** The palette rules a ratchet can switch off, by the name a caller uses. */
const PALETTE_RULES = {
  structural: "theme-protocol/no-structural-palette-color",
  status: "theme-protocol/no-fixed-status-color",
} as const

/**
 * A ratchet for source whose colors have not been migrated yet: it turns off
 * the named palette rules (`structural` for literal grays, `status` for
 * literal status hues) for the globs handed to it. `no-theme-boundary` stays
 * on everywhere. A boundary violation has one fix (an `appearance` prop
 * defaulting to "inherit"); a palette color needs a per-call judgment about
 * which role the literal stood for.
 *
 * Each caller lives in the unmigrated package's own `eslint.config.js`, in
 * front of whoever next edits it, and says why its files are not migrated
 * yet (a fixed art direction, a surface about to be rewritten). Delete a glob
 * to migrate it.
 */
export function paletteRatchet(
  globs: Array<string>,
  rules: ReadonlyArray<keyof typeof PALETTE_RULES>
): Array<Linter.Config> {
  return defineConfig([
    {
      files: globs,
      rules: Object.fromEntries(
        rules.map((rule) => [PALETTE_RULES[rule], "off"])
      ),
    },
  ])
}
