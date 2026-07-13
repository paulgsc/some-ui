import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "@some-ui/core-utils",
  libraryName: "SomeCoreUtils",
  alias: {
    "@core-utils": resolve(__dirname, "src"),
  },
})
