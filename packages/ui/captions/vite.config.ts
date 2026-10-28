import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "some-ui-captions",
  libraryName: "SomeUICaptions",
  alias: {
    "@captions": resolve(import.meta.dirname, "src"),
  },
})
