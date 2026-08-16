import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "@some-ui/intent-kit",
  libraryName: "SomeIntentKit",
  alias: {
    "@intent-kit": resolve(import.meta.dirname, "src"),
  },
})
