#!/usr/bin/env node
// Keeps public/manifest.firefox.json's `version` in lockstep with
// package.json's. The two used to be bumped by hand independently — the
// exact drift that lets a signed build carry the wrong AMO version.
// package.json is now the single field a human (or the changeset version
// bump in extension-release.yml) edits; this makes the manifest source
// follow it automatically, both at release-PR time and again right before
// build so a manually-triggered sign (extension-sign-manual.yml) can't
// drift either.
import fs from "node:fs"
import path from "node:path"

function fail(message) {
  process.stderr.write(`::error::${message}\n`)
  throw new Error(message)
}

function main() {
  const extensionDir = process.argv[2]
  if (!extensionDir) {
    fail("Usage: sync-manifest-version.mjs <extension-dir>")
  }

  const pkgPath = path.join(extensionDir, "package.json")
  const manifestPath = path.join(
    extensionDir,
    "public",
    "manifest.firefox.json"
  )

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"))
  const version = pkg.version
  if (!version) {
    fail(`${pkgPath} has no "version" field`)
  }

  if (!fs.existsSync(manifestPath)) {
    fail(`${manifestPath} not found`)
  }

  const manifestRaw = fs.readFileSync(manifestPath, "utf8")
  const manifest = JSON.parse(manifestRaw)

  if (manifest.version === version) {
    process.stdout.write(
      `sync-manifest-version: ${manifestPath} already at ${version}\n`
    )
    return
  }

  // A parse+re-stringify round trip would reformat the whole file to
  // Node's JSON.stringify style (e.g. every array exploded onto its own
  // lines) instead of the Prettier style it's actually checked into with —
  // turning a one-line version bump into a wall of unrelated reformatting
  // in the diff. Replace just the "version" field's value in place instead.
  const versionFieldRe = /"version"\s*:\s*"[^"]*"/
  if (!versionFieldRe.test(manifestRaw)) {
    fail(`Could not find a "version" field to replace in ${manifestPath}`)
  }
  const previous = manifest.version
  const updated = manifestRaw.replace(
    versionFieldRe,
    () => `"version": "${version}"`
  )
  fs.writeFileSync(manifestPath, updated)
  process.stdout.write(
    `::notice::sync-manifest-version: ${manifestPath} ${previous} -> ${version}\n`
  )
}

main()
