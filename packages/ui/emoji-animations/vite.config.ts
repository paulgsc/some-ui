import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "some-ui-emoji-animations",
  libraryName: "SomeUIEmoji",
  alias: {
    "@emoji": resolve(__dirname, "src"),
  },
})
