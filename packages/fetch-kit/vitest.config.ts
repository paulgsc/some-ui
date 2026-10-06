import { defineNodeTest } from "@some-ui/vite-config/vitest"

// Pure fetch/retry logic - no DOM needed.
export default defineNodeTest({
  alias: { "@fkit": new URL("./src", import.meta.url).pathname },
})
