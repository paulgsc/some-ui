/**
 * Builds the real-microphone suite's page (`index.html`, `page.ts`) into
 * `dist/`, which the spec serves at `http://localhost` (a secure context,
 * as `getUserMedia` needs).
 */
import { resolve } from "node:path"
import { defineConfig } from "vite"

export default defineConfig({
  root: import.meta.dirname,
  logLevel: "warn",
  resolve: {
    alias: {
      "@voice-capture": resolve(import.meta.dirname, "../../src"),
    },
  },
  build: {
    outDir: resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    // A test page: readable stacks matter more than size.
    minify: false,
    sourcemap: true,
  },
})
