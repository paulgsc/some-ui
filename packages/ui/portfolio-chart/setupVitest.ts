// wasm-setup.js
import { readFileSync } from "fs"
import { dirname, resolve } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))

// Override the init function in the wasm-pack generated JS
// This is a bit hacky but effective for testing
globalThis.__wasm_module_cache = {}

// Find the WASM file from various possible locations
function findWasmFile(filename) {
  const possiblePaths = [
    resolve(__dirname, filename),
    resolve(__dirname, "../crates/some-charts/dist", filename),
    resolve(__dirname, "../../crates/some-charts/dist", filename),
    resolve(__dirname, "../../../crates/some-charts/dist", filename),
  ]

  for (const path of possiblePaths) {
    try {
      readFileSync(path)
      return path
    } catch (e) {
      // Continue to next path
    }
  }

  throw new Error(`Could not find WASM file: ${filename}`)
}

// Mock the fetch API for WASM loading
global.fetch = async (input) => {
  if (typeof input === "string" && input.endsWith(".wasm")) {
    try {
      const wasmPath = findWasmFile("some_charts_bg.wasm")
      const buffer = readFileSync(wasmPath)

      return {
        ok: true,
        arrayBuffer: async () =>
          buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength
          ),
      }
    } catch (error) {
      console.error("Error loading WASM file:", error)
      throw error
    }
  }

  throw new Error(`Unhandled fetch request: ${input}`)
}
