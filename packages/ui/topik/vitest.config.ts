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
    passWithNoTests: true,
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
      "@topik": path.resolve(import.meta.dirname, "./src"),
    },
  },
})
