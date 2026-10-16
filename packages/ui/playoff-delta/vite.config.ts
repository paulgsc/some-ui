import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "some-ui-playoff-delta",
  libraryName: "SomeUIPlayoffDelta",
  alias: {
    "@playoff-delta": resolve(import.meta.dirname, "src"),
  },
})
