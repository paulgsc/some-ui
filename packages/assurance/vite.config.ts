import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "@some-ui/assurance",
  libraryName: "SomeAssurance",
  alias: {
    "@assurance": resolve(import.meta.dirname, "src"),
  },
})
