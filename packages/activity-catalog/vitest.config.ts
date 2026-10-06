import { defineNodeTest } from "@some-ui/vite-config/vitest"

// Nothing here touches a DOM: the whole package is pure functions over a
// catalogue. Keeping the node environment is the point, not an omission - it
// is what makes "this module is framework-agnostic" checkable rather than
// merely asserted.
export default defineNodeTest({
  alias: { "@activity-catalog": new URL("./src", import.meta.url).pathname },
  include: ["**/*.test.ts"],
})
