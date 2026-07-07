import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  test: {
    // Required for renderHook and window event simulation
    environment: "jsdom",

    // Allows you to use 'describe', 'it', 'expect' without importing them in every file
    globals: true,

    // Ensures cleanup after each test to prevent listener leaks
    setupFiles: ["./vitest.setup.ts"],

    // Match your file structure
    include: ["**/*.test.{ts,tsx}"],

    // S1 (vitest infra) lands before any spec files exist (S2+); a clean
    // "no tests yet" run must still exit 0.
    passWithNoTests: true,

    deps: {
      optimizer: {
        web: {
          // If you encounter issues with WASM or specific UI libs, add them here
          include: ["@testing-library/react"],
        },
      },
    },
  },
  resolve: {
    alias: {
      // Mirror the "@input/*" -> "./src/*" path mapping from tsconfig.json
      // so tests can import modules that use the alias internally.
      "@input": path.resolve(__dirname, "./src"),
      // The real packages only resolve once `wasm-pack build` has produced
      // their dist/ output. Point them at stubs so tests can run without
      // that build step; tests exercising a bridge override the relevant
      // stub via vi.mock.
      "leetype-wasm": path.resolve(
        __dirname,
        "./src/test/mocks/leetype-wasm-stub.ts"
      ),
      "some-crossword": path.resolve(
        __dirname,
        "./src/test/mocks/some-crossword-stub.ts"
      ),
      "viewport-rotation": path.resolve(
        __dirname,
        "./src/test/mocks/viewport-rotation-stub.ts"
      ),
    },
  },
})
