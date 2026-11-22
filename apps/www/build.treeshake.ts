/**
 * Which of www's modules act when loaded (vite.config.ts's
 * `treeshake.moduleSideEffects`). Every other module is side-effect free to
 * the bundler, so an import that binds nothing is dropped with whatever the
 * module does at load time.
 *
 * VS1 (#3121): a bare import in www's `src/` (`import "@/lib/x"`, not CSS)
 * names a module listed here, and the release build keeps it. Held by
 * `src/lib/demo/__tests__/load-time-modules.test.ts` (every bare import is
 * listed) and `tests/local-mode/viewer-storage.spec.ts` (the built viewer app,
 * the capture build, keeps nothing a viewer wrote across a reload).
 */

/** www's modules that act on load, from www's root. */
export const LOAD_TIME_MODULES: ReadonlyArray<string> = [
  // In a viewer build, the page's storage becomes an in-memory copy before
  // any module reads it (CLAUDE.md, "A viewer tries, and nothing is kept").
  "src/lib/demo/viewer-storage.ts",
]

/** Rolldown's `moduleSideEffects`: true for a listed module, false for every other. */
export function moduleSideEffects(id: string): boolean {
  const path = id.replace(/\\/g, "/")
  return LOAD_TIME_MODULES.some((m) => path.endsWith(`/apps/www/${m}`))
}
