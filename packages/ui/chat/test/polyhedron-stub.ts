/**
 * Test-only stand-in for the `polyhedron` wasm-pack crate.
 *
 * `some-ui-utils`'s barrel (`src/lib/index.ts`) re-exports `useViewport`
 * from `./polyhedron`, which reaches `wasm-runtime.ts`'s
 * `await import("@some-ui/polyhedron")`. Vite's import-analysis resolves
 * that specifier eagerly while transforming the module graph - even though
 * nothing in these tests ever calls `getWasmManager()` to actually load it -
 * so without a real (wasm-pack-built) `@some-ui/polyhedron` package on disk,
 * merely importing anything from `some-ui-utils`'s barrel fails at transform
 * time.
 * This stub is aliased in vitest.config.ts to unblock that resolution.
 */
export default function init(): Promise<void> {
  return Promise.resolve()
}

export class WasmViewportManager {}
