import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "some-ui-neon-sign",
  libraryName: "SomeUINeonSign",
  alias: {
    "@neon-sign": resolve(import.meta.dirname, "src"),
  },
})
