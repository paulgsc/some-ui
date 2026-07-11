// Test-only stand-in for the `@some-ui/some-hexagon` wasm-bindgen package,
// which is only resolvable after `wasm-pack build` has produced its dist/
// output. Individual test files override this via
// `vi.mock("@some-ui/some-hexagon", ...)`; this stub exists purely so the
// specifier resolves during transform.
export default async function init(): Promise<void> {}

export class WasmHexGrid {
  get_all_cells_render_data(): Array<unknown> {
    return []
  }
}
