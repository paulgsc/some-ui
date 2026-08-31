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
 * This is invisible without building. `import type { WordEntry }` and
 * `import { interviewQuestions }` differ by one keyword, live in the same
 * kind of file, and grep reports them identically - but only the second is
 * a bundle edge. It went unnoticed here until someone diffed a chunk.
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
            "@some-ui/interview",
            "@some-ui/leetype",
            "@some-ui/makjang",
            "@some-ui/topik",
            "@some-ui/umag",
            "@some-ui/assessment",
            "@some-ui/slideshow",
            "some-ui-neon-sign",
          ],
          allow: [
            // One genuine direct dependency, and not the component the
            // registry loads: apps/www's composer embeds slideshow's
            // *editor* (editorReducer, EditSceneDialog,
            // OrchestratorTimeline), while the registry loads
            // `ActiveLifetimesPanel` under "scheduled". The composer route
            // is itself code-split, so the eager edge is bounded to it.
            "@some-ui/slideshow",
            // apps/www's /site route ("Under Construction") embeds
            // `HexGrid` directly as a generic hex-grid renderer, not the
            // registry's Hangul applet under "honeycomb". /site is itself
            // an ordinary file-based route, code-split by
            // `autoCodeSplitting: true` (vite.config.ts), so this eager
            // edge is bounded to that one route's own chunk.
            "@some-ui/honeycomb",
          ],
        },
      ],
    },
  },
])
