// Declarative shape of a workspace's style.context.ts — see styles-build/run.mjs.
//
// This is the styles analogue of extensions/common/ext-build/types.ts: the
// abstract single-pass Tailwind compiler lives in one canonical place
// (@some-ui/styles), and each ui/apps workspace only declares its granular
// context (which source files contribute class candidates, where the compiled
// stylesheet goes). No CSS engine wiring is scattered across the consumers.

export type StyleTargetContext = {
  /**
   * Source globs whose class candidates contribute to this target's single
   * pass. Absolute, or relative to the workspace root (the runner resolves
   * them against process.cwd()). A consumer that aggregates a dependency
   * graph — e.g. apps/www — lists its own `src/**` plus each in-graph
   * package's `src/**`; that union is scanned exactly once.
   */
  content: Array<string>
  /**
   * CSS entrypoint that pulls in the shared Tailwind layer. Absolute, or
   * relative to the workspace root. Defaults to the canonical
   * "@some-ui/styles/tailwind.css". Point this at a workspace-local entry
   * when it needs to `@import` extra authored stylesheets on top of the
   * shared layer.
   */
  entry?: string
  /**
   * Compiled stylesheet destination, relative to the workspace root.
   * Defaults to "dist/styles.css".
   */
  outFile?: string
  /** Minify the output. Defaults to true. */
  minify?: boolean
}

/**
 * Keyed by target name. Single-target workspaces use "default"; a workspace
 * that emits more than one stylesheet (e.g. an app shell vs an embedded
 * widget bundle) keys by its own target names.
 */
export type StyleContext = Record<string, StyleTargetContext>
