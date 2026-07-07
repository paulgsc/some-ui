// Test-only stand-in for the `some-crossword` wasm-bindgen crate, which is
// only resolvable after `wasm-pack build` (crates/some-crossword) has
// produced its dist/ output. Individual test files override this via
// `vi.mock("some-crossword", ...)`; this stub exists purely so the bare
// specifier resolves during transform.
export default async function init(): Promise<void> {}

export class CrosswordGenerator {
  generate(): Promise<unknown> {
    return Promise.resolve({})
  }
}
