// Hand-written stand-in for the wasm-bindgen-generated declarations that
// `wasm-pack build` (crates/leetype_wasm) would normally emit into its dist
// output. Resolved via the "@some-ui/leetype-wasm" tsconfig path mapping so
// the ESLint/TS resolver has a real file to point at without requiring a
// WASM build. Only the members imported in this workspace are declared;
// full binding-accurate typing is tracked separately.
import type { WasmModule } from "@leetype/types/leetype"

declare const init: () => Promise<void>
export default init

export declare const TypingGame: WasmModule["TypingGame"]
export function classify_source(input: string): Uint8Array
export function slot_map_from_source(input: string): Int32Array
