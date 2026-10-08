import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "@some-ui/makjang",
  libraryName: "SomeMakjang",
  alias: {
    "@makjang": resolve(import.meta.dirname, "src"),
  },
})
