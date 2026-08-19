/**
 * Loads the real, compiled `@some-ui/leetype-wasm` module for a plain Node
 * script (LTY-PATCH P6, #1081) — as opposed to every `*.test.ts` file,
 * which resolves that specifier to a hand-written `.d.ts` type stub
 * instead (`vitest.config.ts`'s own `resolve.alias` comment: "Tests never
 * want the real binary anyway"). `tsx`-run scripts are not subject to that
 * alias — it is a Vite/Vitest bundler concept, not a Node module
 * resolution rule — so a script can reach the real package normally.
 *
 * Reaching it takes two workarounds, not one `import init from
 * "@some-ui/leetype-wasm"` and a call to `init()`:
 *
 * 1. `tsconfig.json` maps the *bare* `@some-ui/leetype-wasm` specifier to
 *    the hand-written `.d.ts` stub too (so `tsc --noEmit` never needs a
 *    wasm-pack build), and `tsx` honours that mapping the same as `tsc`
 *    does. The mapping is deliberately non-wildcarded — an *exact* match
 *    only — so the subpath `@some-ui/leetype-wasm/dist/leetype_wasm`
 *    still resolves through node_modules to the real, published module;
 *    `types/wasm/bindings-contract.ts` already relies on the same escape
 *    hatch to check this workspace's hand-written bindings against it.
 * 2. wasm-pack's `--target web` output loads its `.wasm` binary via
 *    `fetch(new URL(...))` when called with no arguments, and Node's
 *    built-in `fetch` does not implement `file://` URLs ("not
 *    implemented... yet", per undici). `init()` also accepts the raw bytes
 *    directly (`{ module_or_path: BufferSource }`), which skips the fetch
 *    path entirely — so this reads the `.wasm` file straight off disk and
 *    hands it the bytes.
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
    // The subpath, not the bare specifier — see the module doc comment on
    // why the bare one resolves to the type-only stub even here. The
    // dynamic import's own type is whatever the stub says (the bare
    // specifier's shape), which is not this call's real target, so nothing
    // narrower than `as` can carry it across.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above
    const mod = (await import("@some-ui/leetype-wasm/dist/leetype_wasm")) as {
      default: WasmInit
    } & WasmModule
    await mod.default({ module_or_path: bytes })
    return mod
  })()
  return cached
}
