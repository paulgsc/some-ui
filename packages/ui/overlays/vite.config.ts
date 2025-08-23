import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "some-ui-overlays",
  libraryName: "SomeUIOverlays",
  alias: {
    "@overlays": resolve(__dirname, "src"),
  },
})
