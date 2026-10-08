import { defineNodeTest } from "@some-ui/vite-config/vitest"

// Pure logic - no React, no DOM: the story schema, its audit and the engine
// are tested in node (docs/makjang/README.md, "2. Engine").
export default defineNodeTest({
  // tsconfig.json's `@makjang/*` path, for the tests under src/__tests__/
  // (a parent-relative `../` import is lint-banned).
  alias: { "@makjang": new URL("./src", import.meta.url).pathname },
})
