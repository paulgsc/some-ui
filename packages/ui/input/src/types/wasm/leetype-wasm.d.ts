// Hand-written stand-in for the wasm-bindgen-generated declarations that
// `wasm-pack build` (crates/leetype_wasm) would normally emit into its dist
// output. Resolved via the "@some-ui/leetype-wasm" tsconfig path mapping so
// the ESLint/TS resolver has a real file to point at without requiring a
// WASM build. Only the members imported in this workspace are declared;
// full binding-accurate typing is tracked separately.
import type { WasmModule } from "@input/types/leetype"

declare const init: () => Promise<void>
export default init

export declare const TypingGame: WasmModule["TypingGame"]
export function canonicalize_text(input: string): unknown
export function build_display_map_from_code(input: string): Array<number>
