import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "@some-ui/speech",
  libraryName: "SomeSpeech",
  // One entry per backend, so an app's build carries only the ones it
  // passes to the session (src/lib/adapters/registry.ts).
  entries: {
    http: "src/http.ts",
    "web-speech": "src/web-speech.ts",
    native: "src/native.ts",
  },
  alias: {
    "@speech": resolve(import.meta.dirname, "src"),
  },
  tsConfigPaths: {
    projects: [resolve(import.meta.dirname, "tsconfig.build.json")],
  },
})
