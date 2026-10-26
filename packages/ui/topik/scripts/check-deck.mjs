#!/usr/bin/env node
// usage, from packages/ui/topik: pnpm check:deck <deck.json>
// Prints [] when the app would accept the deck, then what it is for, where it
// is set, and how many lines carry a lens. Exits 0 only when it prints [].
// Loads the app's own parseReadAloudDeck through Vite with topik's `@topik`
// alias, so it needs no build.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createServer } from "vite"

const vite = await createServer({
  configFile: false,
  root: process.cwd(),
  resolve: { alias: { "@topik": resolve("src") } },
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "error",
})
try {
  const { parseReadAloudDeck } = await vite.ssrLoadModule(
    "/src/lib/topik/read-aloud/content/index.ts"
  )
  const r = parseReadAloudDeck(
    JSON.parse(readFileSync(process.argv[2], "utf8"))
  )
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
} finally {
  await vite.close()
}
