import { defineNodeTest } from "@some-ui/vite-config/vitest"

// Pure logic - no React, no DOM. A test needing jsdom here would be the
// Doctrine §1/Pushback 3 split (packages/SHARED_WORKSPACE_DOCTRINE.md) having
// been violated; see the package's own tsconfig/package.json tests for the
// mechanical check.
export default defineNodeTest({
  // tsconfig.json's `@intent-kit/*` path, for the tests under src/__tests__/
  // (a parent-relative `../` import is lint-banned).
  alias: { "@intent-kit": new URL("./src", import.meta.url).pathname },
})
