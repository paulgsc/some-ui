import { noBareWasmSingleton } from "@eslint/rules/index.js"
import { defineConfig } from "eslint/config"

/**
 * Plugin guarding the UTL-WASM epic's (#529) canon: every wasm-bindgen
 * crate load/init/singleton must go through @some-ui/wasm-loader's
 * createWasmLoader(), not a hand-rolled per-workspace loader.
 */
export const wasmLoaderGuardPlugin = {
  meta: { name: "wasm-loader-guard", version: "0.0.1" },
  rules: {
    "no-bare-wasm-singleton": noBareWasmSingleton,
  },
}

/**
 * On by default (in maishatuRecommended): a bare `import("<wasm-crate>")`
 * outside createWasmLoader() is never intentional.
 *
 */
export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx,cts,mts}"],
    plugins: { "wasm-loader-guard": wasmLoaderGuardPlugin },
    rules: {
      "wasm-loader-guard/no-bare-wasm-singleton": "error",
    },
  },
])
