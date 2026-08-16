import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "some-ui-auth",
  libraryName: "SomeUIAuth",
  alias: {
    "@auth": resolve(import.meta.dirname, "src"),
  },
})
