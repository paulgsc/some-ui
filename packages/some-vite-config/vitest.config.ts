import { resolve } from "path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: { "@": resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "node",
    // Sources only: `tsc --outDir dist/esm` compiles these tests too, and the
    // compiled copies must not run a second time.
    include: ["src/**/*.test.ts"],
  },
})
