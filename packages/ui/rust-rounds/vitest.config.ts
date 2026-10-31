import { defineDomTest } from "@some-ui/vite-config/vitest"

// The formats, the lint, the intake, the tutor copy and the session's
// machine are pure; the screens and the kept records need a DOM.
export default defineDomTest({
  alias: {
    "@rust-rounds": new URL("./src", import.meta.url).pathname,
    "@rust-rounds-root": new URL(".", import.meta.url).pathname,
  },
  setupFiles: ["./vitest.setup.ts"],
})
