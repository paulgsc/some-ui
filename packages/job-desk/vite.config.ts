import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "@some-ui/job-desk",
  libraryName: "SomeJobDesk",
  alias: {
    "@job-desk": resolve(import.meta.dirname, "src"),
  },
})
