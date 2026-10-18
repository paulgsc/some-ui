import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "@some-ui/job-desk",
  libraryName: "SomeJobDesk",
  entries: { sample: "src/sample.ts" },
  alias: {
    "@job-desk": resolve(import.meta.dirname, "src"),
  },
})
