import { noEagerRegistryImport } from "@eslint/rules/index.js"
import { defineConfig } from "eslint/config"

/**
 * Plugin keeping the content registry's lazy loading actually lazy.
 *
 * `@some-ui/content-registry` maps a key to a dynamic `import()`, so each
 * applet ships as its own chunk and costs a host nothing until a session
 * binds it. One static value import of the same package from that host
 * gives the bundler a static edge, and the applet joins the eager graph
 * regardless - the dynamic import is still there, still lazy-looking, and
 * no longer doing anything.
 *
 * Invisible without building: `import type { X }` and `import { x }` differ
 * by one keyword, but only the second is a bundle edge (see the rule).
 *
 * Type imports are always allowed, because they are erased. Value imports

 * need a stated reason: either the applet should own the thing (take plain
 * config through scene props, default its own data), or the host's use is
 * genuinely direct and goes in `allow` with a comment.
 */
export const lazyRegistryPlugin = {
  meta: { name: "lazy-registry", version: "0.0.1" },
  rules: {
    "no-eager-registry-import": noEagerRegistryImport,
  },
}

export default defineConfig([
  {
    // Every file of whoever extends this - which is `appsRecommended`, and
    // only that. A path glob can't do the scoping here: each workspace runs
    // eslint from its own directory, so `apps/**` matches nothing when the
    // base path already *is* `apps/www`. Who extends the preset is the
    // scope.
    files: ["**/*.{ts,tsx}"],
    plugins: { "lazy-registry": lazyRegistryPlugin },
    rules: {
      "lazy-registry/no-eager-registry-import": [
        "error",
        {
          // Every package behind a key in `componentRegistry`.
          packages: [
            "@some-ui/honeycomb",
            "@some-ui/leetype",
            "@some-ui/topik",
          ],
        },
      ],
    },
  },
])
