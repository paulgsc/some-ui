import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "some-ui-searchbar",
  libraryName: "SomeUISearchbar",
  alias: {
    "@searchbar": resolve(__dirname, "src"),
  },
})
