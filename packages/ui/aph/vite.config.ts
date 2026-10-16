import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "@some-ui/aph",
  libraryName: "SomeUIAph",
  alias: {
    "@aph": resolve(import.meta.dirname, "src"),
  },
})
