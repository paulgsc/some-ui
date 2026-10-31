import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "@some-ui/rust-rounds",
  libraryName: "SomeUIRustRounds",
  entries: { entry: "src/entry.ts" },
  alias: {
    "@rust-rounds": resolve(import.meta.dirname, "src"),
    // ROUTINE.md sits at the workspace root, where a tutor finds it.
    "@rust-rounds-root": import.meta.dirname,
  },
})
