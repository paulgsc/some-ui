import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "@some-ui/voice-capture",
  libraryName: "SomeVoiceCapture",
  entries: { testing: "src/testing.ts" },
  alias: {
    "@voice-capture": resolve(import.meta.dirname, "src"),
  },
})
