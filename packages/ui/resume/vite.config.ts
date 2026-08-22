import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

// src/index.ts re-exports src/react. Everything else under src/ is Typst
// source for the print templates, which this build does not touch — `include`
// in tsconfig.json only ever matches .ts/.tsx, so the .typ files are inert
// here rather than needing an exclude.
export default createViteConfig({
  packageName: "some-ui-resume",
  libraryName: "SomeUIResume",
  alias: {
    "@resume": resolve(import.meta.dirname, "src/react"),
  },
})
