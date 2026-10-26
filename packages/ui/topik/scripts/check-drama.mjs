#!/usr/bin/env node
// usage: pnpm --filter @some-ui/topik check:drama <drama.json>
// Prints [] when the app's own intakeTree finds nothing in the drama, else
// every finding by path, warnings included: the phone's routine list takes
// only a drama with none (`adapter/routine-files`). Exits 0 only on [].
import { readArg, withSource } from "./source.mjs"

const raw = readArg("pnpm --filter @some-ui/topik check:drama <drama.json>")
await withSource(
  "/src/lib/topik/generation/tree-intake/index.ts",
  ({ intakeTree }) => {
    const r = intakeTree(raw)
    process.stdout.write(
      `${JSON.stringify(r.status === "checked" ? r.findings : r)}\n`
    )
    process.exitCode = r.status === "checked" && r.findings.length === 0 ? 0 : 1
  }
)
