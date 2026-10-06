import path from "path"
import { defineDomTest } from "@some-ui/vite-config/vitest"

export default defineDomTest({
  alias: { "@wireframes": path.resolve(import.meta.dirname, "./src") },
  setupFiles: ["./vitest.setup.ts"],
  include: ["src/**/*.{test,property.test}.{ts,tsx}"],
})
