import { defineNodeTest } from "@some-ui/vite-config/vitest"

export default defineNodeTest({
  // tsconfig.json's `@mailbox/*` path, for the tests under src/__tests__/
  // (a parent-relative `../` import is lint-banned).
  alias: { "@mailbox": new URL("./src", import.meta.url).pathname },
})
