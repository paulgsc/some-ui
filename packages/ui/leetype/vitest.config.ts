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

    passWithNoTests: true,

    deps: {
      optimizer: {
        client: {
          // If you encounter issues with WASM or specific UI libs, add them here
          include: ["@testing-library/react"],
        },
      },
    },
  },
  resolve: {
    alias: {
      // Mirror the "@leetype/*" -> "./src/*" path mapping from tsconfig.json
      // so tests can import modules that use the alias internally.
      "@leetype": path.resolve(import.meta.dirname, "./src"),
      // The wasm package is a workspace crate whose dist/ only exists after
      // a wasm-pack build. Tests never want the real binary anyway (they
      // `vi.mock` it), so this points the specifier at the hand-written
      // declaration stub purely so resolution succeeds without a build.
      "@some-ui/leetype-wasm": path.resolve(
        import.meta.dirname,
        "./src/types/wasm/leetype-wasm.d.ts"
      ),
    },
  },
})
