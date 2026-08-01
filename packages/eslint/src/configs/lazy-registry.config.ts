import { defineConfig } from "eslint/config"

import { noEagerRegistryImport } from "../rules/index.js"

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
    // Every workspace, because each one runs eslint from its own directory -
    // a path glob like `apps/**` matches nothing when the base path already
    // *is* `apps/www`. The `allow` list below carries the exceptions
    // instead, which is the more honest place for them anyway: each is a
    // decision with a reason, not a directory.
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
            // Two genuine direct dependencies, neither of them the component
            // the registry loads:
            //
            // - apps/www's composer embeds slideshow's *editor*
            //   (editorReducer, EditSceneDialog, OrchestratorTimeline), and
            //   the registry loads `ActiveLifetimesPanel` under "scheduled".
            //   The composer route is itself code-split, so the eager edge
            //   is bounded to it.
            // - @some-ui/slideshow composes umag's NowPlayingCard, and the
            //   registry's own cube-content composes slideshow's
            //   ViewportDiceCard. Package-to-package composition is an
            //   ordinary dependency; the hazard this rule exists for is a
            //   *host* short-circuiting its own lazy boundary.
            "@some-ui/slideshow",
            "@some-ui/umag",
          ],
        },
      ],
    },
  },
])
