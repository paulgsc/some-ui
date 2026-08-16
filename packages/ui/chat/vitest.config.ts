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
        client: {
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
      "@chat": path.resolve(import.meta.dirname, "./src"),
      // Component tests render real UI (Button, Card, cn, useSpeechQueue, ...)
      // from these workspace packages. Point at their TS source instead of
      // "dist" so tests don't depend on those packages having been built
      // first (their "main"/"exports" only resolve post-build).
      "@some-ui/shared": path.resolve(import.meta.dirname, "../shared/src"),
      "some-ui-utils": path.resolve(import.meta.dirname, "../../utils/src"),
      // @some-ui/shared's and some-ui-utils's own internal "@shared/*" /
      // "@utils/*" -> "./src/*" aliases.
      "@shared": path.resolve(import.meta.dirname, "../shared/src"),
      "@utils": path.resolve(import.meta.dirname, "../../utils/src"),
      // The real package only exists once wasm-pack has built the
      // `crates/polyhedron` crate. Nothing under test here ever loads it
      // (see test/polyhedron-stub.ts for why it still must resolve).
      "@some-ui/polyhedron": path.resolve(
        import.meta.dirname,
        "./test/polyhedron-stub.ts"
      ),
    },
  },
})
