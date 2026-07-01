// Hand-written stand-in for the wasm-bindgen-generated declarations that
// `wasm-pack build` (crates/some-crossword) would normally emit into its
// dist output. Resolved via the "some-crossword" tsconfig path mapping so
// the ESLint/TS resolver has a real file to point at without requiring a
// WASM build. Only the members imported in this workspace are declared;
// full binding-accurate typing is tracked separately.

declare const init: () => Promise<void>
export default init

export class CrosswordGenerator {
  constructor(words: Array<string>, maxGroupSize: number)
  generate(): Promise<unknown>
}
