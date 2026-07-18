#!/usr/bin/env node
// Prunes the named dependencies from the root ('.') importer's
// dependencies/devDependencies blocks of a pnpm-lock.yaml file, in place.
//
// Why: package-source.sh splices a pruned copy of the root package.json into
// the AMO source archive, dropping devDependencies whose source isn't
// archived (e.g. some-ui-utils, only needed by Storybook's root decorators).
// The archived pnpm-lock.yaml was left untouched, so its root importer still
// listed those same deps with a `link:` version pointing at a directory the
// archive never includes. `pnpm install --frozen-lockfile` — the exact first
// command in README.build.md — fails on that mismatch for anyone extracting
// the archive, which is the AMO reviewer this archive exists for.
//
// Usage: node prune-lockfile-root-deps.mjs <lockfile-path> '["dep-a","dep-b"]'
import { readFileSync, writeFileSync } from "node:fs"

const [, , lockfilePath, pruneNamesJson] = process.argv
if (!lockfilePath || !pruneNamesJson) {
  // eslint-disable-next-line no-console -- CLI script; this is the usage message.
  console.error(
    "usage: prune-lockfile-root-deps.mjs <lockfile-path> '[\"dep-a\"]'"
  )
  // eslint-disable-next-line no-process-exit -- CLI script; non-zero exit signals bad args to the caller.
  process.exit(2)
}
const pruneNames = new Set(JSON.parse(pruneNamesJson))

const indentOf = (line) => line.match(/^ */)[0].length

const lines = readFileSync(lockfilePath, "utf8").split("\n")
const out = []
let inRootImporter = false
// Set to the indent of a dropped key while its sub-lines (specifier, version)
// are skipped; cleared once a line at that indent or shallower reappears.
let skipIndent = null

for (const line of lines) {
  if (skipIndent !== null) {
    if (line.trim() !== "" && indentOf(line) > skipIndent) continue
    skipIndent = null
  }

  if (/^importers:\s*$/.test(line)) {
    out.push(line)
    continue
  }
  if (/^ {2}\.:\s*$/.test(line)) {
    inRootImporter = true
    out.push(line)
    continue
  }
  // Left the root importer block once a line at its own indent (2 spaces)
  // shows up that isn't the `.:` header itself (the next importer, or a
  // top-level lockfile key like `packages:`).
  if (
    inRootImporter &&
    line.trim() !== "" &&
    indentOf(line) <= 2 &&
    !/^ {2}\.:\s*$/.test(line)
  ) {
    inRootImporter = false
  }

  // Dependency entry keys under `dependencies:`/`devDependencies:` sit at
  // 6-space indent (4 for the section header + 2 for map nesting).
  if (inRootImporter && indentOf(line) === 6) {
    const m = line.match(/^ {6}(?:'([^']+)'|([^:'\s#][^:]*)):\s*$/)
    if (m) {
      const name = m[1] ?? m[2]
      if (pruneNames.has(name)) {
        skipIndent = 6
        continue
      }
    }
  }

  out.push(line)
}

writeFileSync(lockfilePath, out.join("\n"))
