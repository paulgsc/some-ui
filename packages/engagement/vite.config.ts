import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "@some-ui/engagement",
  libraryName: "SomeEngagement",
  alias: {
    "@engagement": resolve(import.meta.dirname, "src"),
  },
})
