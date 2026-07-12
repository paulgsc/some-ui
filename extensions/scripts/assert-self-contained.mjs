#!/usr/bin/env node
// Fails if any classic-context entry point of a built extension is not a
// fully self-contained bundle.
//
// Why: content scripts, MV2 background scripts, and MV3 service workers that
// are NOT declared `"type": "module"` are executed by the browser as classic
// scripts. A bundled `import ... from "./chunk.js"` in one of them throws
//   Uncaught SyntaxError: Cannot use import statement outside a module
// at load time — and nothing in the normal build/typecheck/lint pipeline
// catches it. Rollup produces such a shared chunk whenever a module is
// imported by two or more entry points (e.g. a util hoisted to a shared
// package and referenced from content.js + background.js), so this is an
// easy regression to introduce accidentally.
//
// HTML-hosted entries (popup, options pages) are emitted by Vite with
// `<script type="module">` and are therefore allowed to import chunks — they
// are intentionally NOT checked.
//
// A baseline file records the entries that already violate this invariant so
// the check can land green and ratchet: any *new* violation fails CI, and the
// baseline can only be reduced (never grown) as builds are fixed.
//
// Usage: node extensions/scripts/assert-self-contained.mjs <extension-dist-dir> [--baseline <file>]
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { init, parse } from "es-module-lexer"

const args = process.argv.slice(2)
const distArg = args.find((a) => !a.startsWith("--"))
if (!distArg) {
  console.error(
    "usage: assert-self-contained.mjs <extension-dist-dir> [--baseline <file>]"
  )
  process.exit(2)
}
const dist = resolve(distArg)
const here = dirname(fileURLToPath(import.meta.url))
const baselineIdx = args.indexOf("--baseline")
const baselinePath =
  baselineIdx !== -1
    ? args[baselineIdx + 1]
    : join(here, "self-contained-baseline.json")

const manifestPath = join(dist, "manifest.json")
if (!existsSync(manifestPath)) {
  console.error(`❌ no manifest.json in ${dist} — did the extension build?`)
  process.exit(2)
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
// Human-facing name for messages; stable slug (the extensions/<slug> folder)
// as the baseline key so it survives manifest display-name edits.
const extName = manifest.name ?? dist
const slug = basename(dirname(dist))

// ── Collect entries that MUST be self-contained (classic execution) ─────────
const classicEntries = new Set()
for (const s of manifest.background?.scripts ?? []) classicEntries.add(s) // MV2
if (
  manifest.background?.service_worker &&
  manifest.background?.type !== "module"
)
  classicEntries.add(manifest.background.service_worker) // MV3 non-module worker
for (const cs of manifest.content_scripts ?? [])
  for (const j of cs.js ?? []) classicEntries.add(j)

// ── Baseline: { "<extension slug>": ["entry-that-may-still-import.js", ...] } ─
let baseline = {}
if (existsSync(baselinePath))
  baseline = JSON.parse(readFileSync(baselinePath, "utf8"))
const allowed = new Set(baseline[slug] ?? [])

await init
const newViolations = []
const clearedFromBaseline = []

for (const entry of classicEntries) {
  const file = join(dist, entry)
  if (!existsSync(file)) {
    newViolations.push(`${entry}: declared in manifest but missing from dist`)
    continue
  }
  const [imports, exports] = parse(readFileSync(file, "utf8"))
  const specifiers = imports.map((i) => i.n).filter(Boolean) // named module specifiers only
  const selfContained = specifiers.length === 0 && exports.length === 0
  if (selfContained) {
    if (allowed.has(entry)) clearedFromBaseline.push(entry)
    continue
  }
  const detail = `imports [${specifiers.join(", ")}]${
    exports.length ? ` exports [${exports.map((e) => e.n).join(", ")}]` : ""
  }`
  if (allowed.has(entry)) continue // known, baselined debt — tolerated
  newViolations.push(`${entry}: not self-contained — ${detail}`)
}

if (newViolations.length) {
  console.error(`❌ ${extName}: classic entry point(s) are not self-contained:`)
  for (const v of newViolations) console.error(`   • ${v}`)
  console.error(
    `\n   Content scripts, MV2 background scripts, and non-module MV3 service\n` +
      `   workers run as classic scripts and cannot use ESM import/export.\n` +
      `   A shared Rollup chunk leaked into one of them (commonly a util hoisted\n` +
      `   into a shared package and imported from more than one entry). Inline it\n` +
      `   into each classic entry, or split the entries into single-input builds.`
  )
  process.exit(1)
}

if (clearedFromBaseline.length) {
  console.error(
    `❌ ${extName}: baseline is stale — these entries are now self-contained and\n` +
      `   must be removed from ${baselinePath}:\n   • ${clearedFromBaseline.join("\n   • ")}\n\n` +
      `   The baseline ratchets down only; drop the fixed entries to keep it honest.`
  )
  process.exit(1)
}

const note = allowed.size ? ` (${allowed.size} baselined, tolerated)` : ""
console.log(
  `✅ ${extName}: all ${classicEntries.size} classic entry point(s) self-contained${note}.`
)
