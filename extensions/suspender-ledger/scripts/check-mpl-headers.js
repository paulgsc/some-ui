#!/usr/bin/env node
// Verifies that all MPL-2.0-scoped source files carry the required SPDX header.
// MPL-2.0 scope: src/worker/**, src/content/watch.ts, src/lib/platform/firefox.ts
// Run via: pnpm check:headers
import { readdirSync, readFileSync, statSync } from "fs"
import { join, relative } from "path"
import { fileURLToPath } from "url"

const ROOT = join(fileURLToPath(import.meta.url), "../..")

const REQUIRED_HEADER =
  "This Source Code Form is subject to the terms of the Mozilla Public"

const MPL_SCOPED = [
  "src/worker",
  "src/content/watch.ts",
  "src/lib/platform/firefox.ts",
]

function collectFiles(pathStr) {
  const abs = join(ROOT, pathStr)
  try {
    const stat = statSync(abs)
    if (stat.isFile()) return [abs]
    return readdirSync(abs, { recursive: true })
      .filter((f) => f.endsWith(".ts"))
      .map((f) => join(abs, f))
  } catch {
    return []
  }
}

const files = MPL_SCOPED.flatMap(collectFiles)
const missing = []

for (const file of files) {
  const content = readFileSync(file, "utf8")
  if (!content.includes(REQUIRED_HEADER)) {
    missing.push(relative(ROOT, file))
  }
}

if (missing.length > 0) {
  console.error("ERROR: Missing MPL-2.0 header in the following files:")
  for (const f of missing) console.error(`  ${f}`)
  console.error(
    "\nAdd this header at the top of each file:\n" +
      "  // This Source Code Form is subject to the terms of the Mozilla Public\n" +
      "  // License, v. 2.0. If a copy of the MPL was not distributed with this\n" +
      "  // file, You can obtain one at https://mozilla.org/MPL/2.0/."
  )
  process.exit(1)
}

console.log(`✓ MPL-2.0 headers verified in ${files.length} file(s)`)
