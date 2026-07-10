import { createWasmLoader } from "@some-ui/wasm-loader"
import init from "some-hexagon"

// This site has no cross-call caching - every buildHexgrid() call (including
// regenerate()) re-initializes the module, so the loader is reset
// immediately before each load() to preserve that contract while still
// routing through the canonical substrate. errorPolicy "throw" preserves
// the original unguarded `await init()` behavior of propagating a failed
// init as a rejection.
const loader = createWasmLoader({
  importModule: () => init(),
  errorPolicy: "throw",
})

export async function initializeWasm(): Promise<void> {
  loader.reset()
  await loader.load()
}
