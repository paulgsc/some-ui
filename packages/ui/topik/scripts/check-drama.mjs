#!/usr/bin/env node
// usage, from packages/ui/topik: pnpm check:drama <drama.json>
// Prints [] when the app would accept the drama. Exits 0 only when it prints [].
// Loads the app's own intakeTree through topik's Vite config, so it needs no
// build.
import { readFileSync } from "node:fs"
import { createServer } from "vite"

const vite = await createServer({
  configFile: "vite.config.ts",
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "error",
})
try {
  const { intakeTree } = await vite.ssrLoadModule(
    "/src/lib/topik/generation/tree-intake/index.ts"
  )
  const r = intakeTree(readFileSync(process.argv[2], "utf8"))
  const errors =
    r.status === "checked"
      ? r.findings.filter((f) => f.severity === "error")
      : null
  process.stdout.write(`${JSON.stringify(errors ?? r)}\n`)
  process.exitCode = errors && errors.length === 0 ? 0 : 1
} finally {
  await vite.close()
}
