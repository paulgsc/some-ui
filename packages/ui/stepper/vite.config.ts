import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "some-ui-stepper",
  libraryName: "SomeUIStepper",
  alias: {
    "@stepper": resolve(__dirname, "src"),
  },
})
