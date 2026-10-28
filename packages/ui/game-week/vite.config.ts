import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "@some-ui/game-week",
  libraryName: "SomeUIGameWeek",
  alias: {
    "@game-week": resolve(import.meta.dirname, "src"),
  },
})
