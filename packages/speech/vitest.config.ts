import { defineDomTest } from "@some-ui/vite-config/vitest"

// The adapters, the player and the React surface all touch DOM globals
// (AudioContext, speechSynthesis, React roots) - jsdom supplies the ones it
// has, and the fakes in `src/lib/testing` supply the rest.
export default defineDomTest({
  alias: { "@speech": new URL("./src", import.meta.url).pathname },
})
