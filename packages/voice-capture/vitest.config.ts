import path from "path"
import { defineDomTest } from "@some-ui/vite-config/vitest"

// The recorder's tests stub the browser's microphone globals.
export default defineDomTest({
  alias: { "@voice-capture": path.resolve(import.meta.dirname, "./src") },
})
