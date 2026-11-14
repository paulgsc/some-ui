import { defineNodeTest } from "@some-ui/vite-config/vitest"

// The faults are pure: no DOM, no clock, no network, no storage.
export default defineNodeTest({
  alias: { "@interview-week": new URL("./src", import.meta.url).pathname },
})
