import { defineNodeTest } from "@some-ui/vite-config/vitest"

// Pure data and pure functions: no DOM, so the node environment.
export default defineNodeTest({
  // tsconfig.json's `@engagement/*` path, for the tests under
  // src/lib/__tests__/ (a parent-relative `../` import is lint-banned).
  alias: { "@engagement": new URL("./src", import.meta.url).pathname },
  include: ["**/*.test.ts"],
})
