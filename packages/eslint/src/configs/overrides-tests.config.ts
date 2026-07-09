import { defineConfig } from "eslint/config"

export default defineConfig({
  files: [
    "**/tests/**/*.{ts,tsx,cts,mts}",
    "packages/integration-tests/**/*.{ts,tsx,cts,mts}",
    "**/*.test.{ts,tsx}",
    "**/*.spec.{ts,tsx}",
  ],
  rules: {
    "no-console": "off",
    // Allow deprecated APIs in tests — they often test deprecated paths
    "@typescript-eslint/no-deprecated": "off",
    // Floating promises are common in test assertions (fire-and-forget expect)
    "@typescript-eslint/no-floating-promises": "off",
    // Tests routinely `await import("<wasm-crate>")` to grab the vi.mock()'d
    // module for assertions (vi.mocked(mod.default)...) - a fixture-access
    // pattern, not the production singleton the guard exists to catch.
    "wasm-loader-guard/no-bare-wasm-singleton": "off",
  },
})
