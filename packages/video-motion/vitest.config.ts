import { defineNodeTest } from "@some-ui/vite-config/vitest"

export default defineNodeTest({
  // tsconfig.json's `@video-motion/*` path, for the tests under src/__tests__/
  // (a parent-relative `../` import is lint-banned).
  alias: { "@video-motion": new URL("./src", import.meta.url).pathname },
})
