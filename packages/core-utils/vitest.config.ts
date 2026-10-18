import { defineNodeTest } from "@some-ui/vite-config/vitest"

// cn/string/date/array utils are pure logic - no DOM needed.
export default defineNodeTest({
  // tsconfig.json's `@core-utils/*` path, for the tests under `__tests__/`.
  alias: { "@core-utils": new URL("./src", import.meta.url).pathname },
})
