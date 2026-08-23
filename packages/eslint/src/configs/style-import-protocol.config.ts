import { defineConfig } from "eslint/config"

import { parentRelativeImportPattern } from "./base.config.js"

/**
 * A workspace package's `"./style.css"` export subpath (see
 * packages/ui/dice-card/package.json, packages/ui/auth/package.json) points
 * at a *compiled* stylesheet - its own copy of the shared Tailwind layer plus
 * whatever authored CSS the package built alongside it. That subpath exists
 * for an external consumer who installs the package standalone; it was never
 * meant to be imported by another workspace inside this monorepo.
 *
 * apps/www's own index.css used to `@import` each consumed package's
 * `style.css` this way, and that is exactly what produced #636: N copies of
 * the compiled Tailwind layer, concatenated in whatever order the module
 * graph happened to resolve them, deciding the cascade non-deterministically.
 * The fix removed those imports (see apps/www/src/index.css's header
 * comment) in favor of a single Tailwind pass over an explicit @source graph,
 * with a package's own *authored* (non-utility) CSS pulled from its source -
 * not its compiled output - via main.tsx's `import.meta.glob` over
 * `packages/ui/**\/src/**\/*.css`.
 *
 * A route re-adding `import "@some-ui/x/style.css"` reopens exactly that
 * bug, and nothing short of this rule notices: the file compiles, Vite
 * resolves the subpath happily (the package.json `exports` map says it
 * exists), and the only symptom is a cascade that differs from build to
 * build (paulgsc/some-ui#1146).
 *
 * Scoped to this monorepo's own package-naming conventions
 * (`@some-ui/<pkg>/style.css`, and the handful of unscoped `some-ui-<pkg>`
 * names - see packages/*\/package.json), not a blanket `**\/style.css`. A
 * bare `**` pattern also matches a same-directory `import "./style.css"`
 * (a locally authored stylesheet, no different from the `./index.css` /
 * `./auth.css` imports already used throughout packages/ui/*) and a
 * third-party `import "@vendor/widget/style.css"` (an external npm
 * package's own stylesheet, which was never compiled from this repo's
 * Tailwind layer and has nothing to do with #636). Neither is the mistake
 * this rule exists to catch, so neither should fail it.
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
