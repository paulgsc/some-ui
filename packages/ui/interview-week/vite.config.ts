import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "@some-ui/interview-week",
  libraryName: "SomeUIInterviewWeek",
  alias: {
    "@interview-week": resolve(import.meta.dirname, "src"),
  },
})
