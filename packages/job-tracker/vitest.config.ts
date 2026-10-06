import { defineNodeTest } from "@some-ui/vite-config/vitest"

// Pure functions over an array — no DOM needed, same as
// packages/activity-catalog. Keeping the node environment is what makes "this
// package doesn't need a browser" checkable rather than merely asserted.
export default defineNodeTest({
  alias: { "@job-tracker": new URL("./src", import.meta.url).pathname },
  include: ["**/*.test.ts"],
})
