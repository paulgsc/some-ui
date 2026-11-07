import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "some-ui-playoff-delta",
  libraryName: "SomeUIPlayoffDelta",
  // The recorders' Node entry: no React, no CSS (`src/recording.ts`).
  entries: { recording: "src/recording.ts" },
  alias: {
    "@playoff-delta": resolve(import.meta.dirname, "src"),
  },
})
