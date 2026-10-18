import { defineNodeTest } from "@some-ui/vite-config/vitest"

export default defineNodeTest({
  // tsconfig.json's `@job-desk/*` path, for the tests under src/__tests__/
  // (a parent-relative `../` import is lint-banned).
  alias: { "@job-desk": new URL("./src", import.meta.url).pathname },
})
