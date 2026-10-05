import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    deps: {
      optimizer: {
        client: {
          include: ["@testing-library/react"],
        },
      },
    },
  },
  resolve: {
    alias: {
      // Mirror the "@honeycomb/*" -> "./src/*" path mapping from tsconfig.json
      // so tests can import modules that use the alias internally.
      "@honeycomb": path.resolve(import.meta.dirname, "./src"),
    },
  },
})
