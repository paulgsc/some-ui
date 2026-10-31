import { defineNodeTest } from "@some-ui/vite-config/vitest"

// The formats, the lint, the intake and the tutor copy are pure: no DOM.
export default defineNodeTest({
  alias: {
    "@rust-rounds": new URL("./src", import.meta.url).pathname,
    // ROUTINE.md sits at the workspace root, where a tutor finds it.
    "@rust-rounds-root": new URL(".", import.meta.url).pathname,
  },
})
