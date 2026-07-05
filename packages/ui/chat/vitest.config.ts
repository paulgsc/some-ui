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
      // Mirror the "@chat/*" -> "./src/*" path mapping from tsconfig.json
      // so tests can import modules that use the alias internally.
      "@chat": path.resolve(__dirname, "./src"),
    },
  },
})
