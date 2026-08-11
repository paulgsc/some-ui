import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "@some-ui/styles",
    // Node, not a DOM: the styles-build tests resolve the engine directory
    // from `import.meta.url`, and happy-dom rewrites that to a non-file URL
    // (`fileURLToPath` then throws before a single test runs). The two theme
    // suites that do need a document opt in per-file with a
    // `@vitest-environment` pragma instead.
    environment: "node",
    include: ["styles-build/tests/**/*.test.ts", "src/**/*.test.ts"],
    // The single pass shells the real Tailwind compiler over the shared layer;
    // a generous timeout keeps cold CI runs from flaking.
    testTimeout: 30_000,
  },
})
