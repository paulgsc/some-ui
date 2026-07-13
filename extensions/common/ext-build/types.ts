// Declarative shape of an extension's build.context.ts — see build/run.mjs.
export type BuildEntry = {
  /** Output file stem; written as dist/<name>.js */
  name: string
  /** Entry source, relative to the extension root */
  input: string
  /**
   * "iife" for classic-context entries (content scripts, non-module
   * background/service worker) — guarantees zero import/export in output.
   * "es" for module contexts (popup, options, a module service worker).
   * Defaults to "iife", the safe choice for every context.
   */
  format?: "iife" | "es"
}

/** A file or directory copied into dist/ once, after all entries build. */
export type CopyStep = {
  /** Source, relative to the extension root (or repo root via "../.."). */
  from: string
  /** Destination, relative to dist/. */
  to: string
}

export type BuildTargetContext = {
  entries: Array<BuildEntry>
  /** Resolved against the extension root; wins over any tsconfig path. */
  alias?: Record<string, string>
  /** Rollup externals (e.g. a wasm crate whose dist/ isn't built yet). */
  external?: Array<string>
  copy?: Array<CopyStep>
}

/**
 * Keyed by target name. Single-target extensions use "default"; extensions
 * with browser-specific manifests (Firefox/Chromium) key by platform, e.g.
 *   { firefox: {...}, chromium: {...} }
 */
export type BuildContext = Record<string, BuildTargetContext>
