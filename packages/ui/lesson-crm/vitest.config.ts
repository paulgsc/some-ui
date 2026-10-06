import path from "path"
import { defineDomTest } from "@some-ui/vite-config/vitest"

export default defineDomTest({
  alias: { "@lesson-crm": path.resolve(import.meta.dirname, "./src") },
  setupFiles: ["./vitest.setup.ts"],
  passWithNoTests: true,
  optimizeTestingLibrary: true,
})
