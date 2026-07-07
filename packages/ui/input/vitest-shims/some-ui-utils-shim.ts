// Test-only resolution shim for the `some-ui-utils` bare specifier.
// `some-ui-utils`'s package.json `exports` only points at `dist/`, which is
// never built here (its own barrel re-exports `./lib/polyhedron`, which in
// turn imports the unbuilt `polyhedron` wasm-bindgen crate — the same
// repo-wide "no wasm-pack toolchain" gap noted in vitest.config.ts for
// leetype-wasm/some-crossword/viewport-rotation, just one hop further away).
//
// Re-exporting the two specific leaf modules `packages/ui/input` actually
// imports from `some-ui-utils` — bypassing its barrel (`src/index.ts` ->
// `src/lib/index.ts` -> `./polyhedron`) entirely — gives tests the real
// `getRandomSubarray`/`createEventBus` implementations without needing that
// build.
//
// Deliberately lives outside `src/` (and outside tsconfig.json's `include`)
// rather than under `src/test/mocks/`: this file's cross-package relative
// import would otherwise trip tsc's `rootDir` check for this package. Vite
// (and vitest.config.ts's `resolve.alias`) don't care about tsconfig's
// `include` at all, so this location is invisible to `tsc` but still
// resolves fine at test-run time.
export { getRandomSubarray } from "../../../utils/src/lib/array-utils"
export { createEventBus } from "../../../utils/src/lib/context/event-bus"
