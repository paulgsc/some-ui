// Test-only resolution shim for the `@some-ui/slideshow` bare specifier —
// same rationale as `some-ui-utils-shim.ts`: its package.json `exports`
// only points at an unbuilt `dist/`. `use-viewport-rotation-wasm.ts` (and,
// transitively, `use-create-crossword-puzzle.ts` for `clueEvents`) only
// need `cubeEvents`, whose source file has no other runtime dependency
// beyond `some-ui-utils` (already shimmed) and a type-only import — so
// re-exporting it directly from source sidesteps the unbuilt dist/.
//
// See some-ui-utils-shim.ts for why this lives outside `src/`.
export { cubeEvents } from "../../slideshow/src/hooks/use-rotating-cube"
