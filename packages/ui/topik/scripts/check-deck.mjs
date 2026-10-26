#!/usr/bin/env node
// usage: pnpm --filter @some-ui/topik check:deck <deck.json>
// Prints [] when the app's own parseReadAloudDeck keeps every line, then the
// deck's practice, context, lines kept and lens lines. Exits 0 only on [].
import { readArg, withSource } from "./source.mjs"

const raw = readArg("pnpm --filter @some-ui/topik check:deck <deck.json>")
await withSource(
  "/src/lib/topik/read-aloud/content/index.ts",
  ({ parseReadAloudDeck }) => {
    const r = parseReadAloudDeck(JSON.parse(raw))
    process.stdout.write(`${r.ok ? JSON.stringify(r.findings) : r.error}\n`)
    if (r.ok) {
      const { practice, context, lines } = r.deck
      const where = context ? `${context.genre}, "${context.premise}"` : "none"
      const lensed = lines.filter((l) => l.lens).length
      process.stdout.write(
        `practice: ${practice ?? "none"} · context: ${where} · lines: ${lines.length} · lens lines: ${lensed} of ${lines.length}\n`
      )
    }
    process.exitCode = r.ok && r.findings.length === 0 ? 0 : 1
  }
)
