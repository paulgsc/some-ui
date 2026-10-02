import { defineConfig } from "vitest/config"

// Only `lib/` is tested here, in `node`: the shelf's runtime and port
// helpers are plain TypeScript. The components that read them are covered
// where an activity mounts them (`@some-ui/leetype`, `@some-ui/topik`).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
