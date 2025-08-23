import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "some-ui-resume",
  libraryName: "SomeUIResume",
  alias: {
    "@resume": resolve(__dirname, "src"),
  },
})
