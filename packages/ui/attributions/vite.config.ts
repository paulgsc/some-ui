import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "attributions",
  libraryName: "SomeUIAttributions",
  alias: {
    "@attributions": resolve(__dirname, "src"),
  },
})
