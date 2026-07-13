import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "@some-ui/styles",
    environment: "node",
    include: ["styles-build/tests/**/*.test.ts"],
    // The single pass shells the real Tailwind compiler over the shared layer;
    // a generous timeout keeps cold CI runs from flaking.
    testTimeout: 30_000,
  },
})
