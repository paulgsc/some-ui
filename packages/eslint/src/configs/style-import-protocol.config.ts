import { defineConfig } from "eslint/config"

import { parentRelativeImportPattern } from "./base.config.js"

/**
 * A workspace package's `"./style.css"` export subpath (see
 * packages/ui/auth/package.json) points
 * at a *compiled* stylesheet - its own copy of the shared Tailwind layer plus
 * whatever authored CSS the package built alongside it. That subpath exists
 * for an external consumer who installs the package standalone; it was never
 * meant to be imported by another workspace inside this monorepo.
 *
 * Importing several of them concatenates N copies of the compiled Tailwind
 * layer in module-graph order, so the cascade differs from build to build
 * (#636), and nothing else notices: the subpath resolves fine. apps/www runs
 * a single Tailwind pass instead and pulls a package's authored CSS from its
 * source via main.tsx's `import.meta.glob` over
 * `packages/ui/**\/src/**\/*.css` (see apps/www/src/index.css).
 *
 * Scoped to this monorepo's own package-naming conventions
 * (`@some-ui/<pkg>/style.css`, and the handful of unscoped `some-ui-<pkg>`
 * names - see packages/*\/package.json), not a blanket `**\/style.css`,
 * which would also match a local `import "./style.css"` and a third-party
 * package's own stylesheet. Neither is this mistake.

 */
export const compiledPackageStyleImportBanPattern = {
  group: ["@some-ui/*/style.css", "some-ui-*/style.css"],
  message:
    "Do not import a workspace package's compiled \"style.css\" export from inside this monorepo (#636). That subpath is for an external consumer installing the package standalone - each copy carries its own compiled Tailwind layer, and concatenating several here lets module-graph merge order decide the cascade. A package's authored CSS reaches this app through main.tsx's import.meta.glob over its *source*, not by importing its compiled output.",
}

/**
 * Scoped to `appsRecommended` only: an app is the thing with an index.css
 * and a main.tsx, so it is the only place this specific mistake is
 * reachable. `uiRecommended` gets the same pattern through
 * theme-protocol.config.ts's own `no-restricted-imports` array instead of
 * this file's default export, because that file already owns the winning
 * declaration for packages/ui/* - flat config replaces (never merges) a
 * rule's value at the most specific matching config, so every override has
 * to restate the full pattern list rather than layering this file on top of
 * it (same convention documented on `parentRelativeImportPattern` and
 * `themeProviderBanPattern`).
 */
export default defineConfig([
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            parentRelativeImportPattern,
            compiledPackageStyleImportBanPattern,
          ],
        },
      ],
    },
  },
])
