import { defineNodeTest } from "@some-ui/vite-config/vitest"

// Each hook test opts into jsdom with a `@vitest-environment` pragma.
export default defineNodeTest({
  // tsconfig.json's `@react-hooks/*` path, which the hooks use for each other
  // (a parent-relative `../` import is lint-banned).
  alias: { "@react-hooks": new URL("./src", import.meta.url).pathname },
})
