import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "umag",
  libraryName: "SomeUIUmag",
  alias: {
    "@umag": resolve(__dirname, "src"),
  },
})
