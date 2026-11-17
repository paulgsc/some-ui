/**
 * Joins the capture jobs' halves into one snip bundle (SNIPS1,
 * `docs/snips.md`): reads each `part-*.json` in the directory, checks every
 * file a record names is there with the hash it was given, and writes
 * `manifest.json` and `SHA256SUMS` beside them. Run by
 * `.github/workflows/snips-capture.yml`'s bundle job:
 *
 *   pnpm --filter www exec tsx scripts/snips-bundle.ts <dir> <commit> <run-url>
 *
 * Fails, writing nothing, on a missing or altered file, parts that name two
 * app versions, or two snips with one id.
 */

import { createHash } from "node:crypto"
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { checksumsOf, manifestOf, parsePart } from "@/lib/snips"
import type { SnipFile } from "@/lib/snips"

const [dir, commit, url] = process.argv.slice(2)
if (!dir || !commit || !url) {
  throw new Error("usage: snips-bundle.ts <dir> <commit> <run-url>")
}

const partFiles = readdirSync(dir).filter((f) => /^part-.+\.json$/.test(f))
if (partFiles.length === 0) throw new Error(`no part-*.json in ${dir}`)
const parts = partFiles.map((f) =>
  parsePart(readFileSync(join(dir, f), "utf8"))
)
const manifest = manifestOf(parts, { commit, url })

const files: Array<SnipFile> = manifest.snips.flatMap((s) =>
  s.recording ? [s.image, s.recording] : [s.image]
)
for (const file of files) {
  const bytes = readFileSync(join(dir, file.name))
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  if (sha256 !== file.sha256 || bytes.length !== file.bytes) {
    throw new Error(`${file.name} is not the file its record names`)
  }
}

const text = `${JSON.stringify(manifest, null, 2)}\n`
writeFileSync(join(dir, "manifest.json"), text)
const manifestSum = createHash("sha256").update(text).digest("hex")
writeFileSync(
  join(dir, "SHA256SUMS"),
  checksumsOf([...files, { name: "manifest.json", sha256: manifestSum }])
)
// The halves are in the manifest now; what is left is the bundle.
for (const f of partFiles) rmSync(join(dir, f))
rmSync(join(dir, ".video"), { recursive: true, force: true })

process.stdout.write(
  `${manifest.snips.length} snips, ${manifest.unreached.length} routes unreached, app ${manifest.appVersion}\n`
)
