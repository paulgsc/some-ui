import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

import { buildAudiencePlugin } from "./build.profiles.ts"

/**
 * Scoped to src/**: vitest's default glob would also pick up tests/, whose
 * specs are Playwright-only.
 */
export default defineConfig({
  // Serves `virtual:build-profile` (src/lib/build-profile), default profile,
  // without the import-gate check (gated-route tests sit outside the gate).
  plugins: [buildAudiencePlugin({ checkGates: false })],
  test: {
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    // Repairs `localStorage` where the runtime's own shadows jsdom's (see the
    // file's header).
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      // Before "@": vite's alias matcher takes the first prefix match.
      "@/style.context": resolve(import.meta.dirname, "./style.context.ts"),
      // Same reason, same placement: read by the audience-gate test.
      "@/build.profiles": resolve(import.meta.dirname, "./build.profiles.ts"),
      "@/build.paths": resolve(import.meta.dirname, "./build.paths.ts"),
      "@/file-host.dev": resolve(import.meta.dirname, "./file-host.dev.ts"),
      // Mirrors vite.config.ts's "@" -> "./src" alias, which this config
      // doesn't extend.
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
})
