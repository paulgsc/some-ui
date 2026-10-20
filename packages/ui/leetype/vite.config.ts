import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "@some-ui/leetype",
  libraryName: "SomeUILeetype",
  alias: {
    "@leetype": resolve(import.meta.dirname, "src"),
  },
})
