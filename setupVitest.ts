// wasm-test-setup.js
import { readFile } from "fs/promises"
import { dirname, resolve } from "path"
import { fileURLToPath } from "url"

// This is required to handle WASM in Node environment
global.fetch = async (url) => {
  if (url.startsWith("file:")) {
    const path = url.replace("file://", "")
    const buffer = await readFile(path)
    return {
      ok: true,
      arrayBuffer: async () => buffer,
    }
  }

  // Handle relative paths to the WASM file
  if (url.endsWith(".wasm")) {
    const __dirname = dirname(fileURLToPath(import.meta.url))
    const wasmPath = resolve(__dirname, "../crates/some-charts/dist", url)
    const buffer = await readFile(wasmPath)
    return {
      ok: true,
      arrayBuffer: async () => buffer,
    }
  }

  throw new Error(`Fetch not implemented for URL: ${url}`)
}
