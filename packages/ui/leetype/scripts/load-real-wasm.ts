/**
 * Loads the real, compiled `@some-ui/leetype-wasm` for a plain Node script
 * (vitest aliases it to a `.d.ts` stub; `tsx` is not subject to that alias).
 * Two workarounds:
 *
 * 1. `tsconfig.json` maps the *bare* specifier to the stub, and `tsx` honours
 *    it. The mapping is exact, not wildcarded, so the subpath
 *    `@some-ui/leetype-wasm/dist/leetype_wasm` still reaches the real module
 *    (as `types/wasm/bindings-contract.ts` relies on).
 * 2. With no arguments, `--target web` output `fetch`es its `.wasm`, and
 *    Node's `fetch` has no `file://`. `init()` also takes the raw bytes, so
 *    this reads the file and passes them.
 */
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import type { WasmModule } from "@leetype/types/leetype"

const require = createRequire(import.meta.url)

type WasmInit = (input: { module_or_path: Uint8Array }) => Promise<unknown>

let cached: Promise<WasmModule> | undefined

/**
 * The real wasm module, initialized once per process. Safe to call more
 * than once — later callers get the same in-flight or settled promise
 * rather than re-instantiating the module.
 */
export function loadRealWasm(): Promise<WasmModule> {
  cached ??= (async (): Promise<WasmModule> => {
    const wasmPath = require.resolve(
      "@some-ui/leetype-wasm/dist/leetype_wasm_bg.wasm"
    )
    const bytes = readFileSync(wasmPath)
    // The subpath (see the module doc comment). Its static type is the
    // stub's, not the real target's, so only `as` can carry it.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above
    const mod = (await import("@some-ui/leetype-wasm/dist/leetype_wasm")) as {
      default: WasmInit
    } & WasmModule
    await mod.default({ module_or_path: bytes })
    return mod
  })()
  return cached
}
