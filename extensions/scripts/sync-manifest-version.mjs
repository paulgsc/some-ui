#!/usr/bin/env node
// Keeps public/manifest.firefox.json's `version` in lockstep with
// package.json's, for extensions that use that naming convention — not all
// do (some-conveyor uses public/firefox-v3-manifest.json; some-drama and
// some-mujik ship only public/manifest.json). An extension without
// public/manifest.firefox.json is skipped entirely in both modes below:
// this convention isn't universal, and neither entry point should block
// signing an extension that never opted into it.
//
// Two entry points:
//
//   sync-manifest-version.mjs <dir>          Fix + write. Used by the
//                                             release-PR flow
//                                             (extension-release-version),
//                                             which commits the result in
//                                             the same PR as the
//                                             package.json bump.
//
//   sync-manifest-version.mjs --check <dir>  Verify only, fail on mismatch.
//                                             Used by _extension-sign.yml,
//                                             right before signing. A
//                                             silent write there would fix
//                                             only the *working tree* —
//                                             package-source.sh's
//                                             `git archive HEAD` packages
//                                             whatever's actually
//                                             committed, so a drift
//                                             "fixed" only at sign time
//                                             leaves the submitted xpi and
//                                             the AMO source archive built
//                                             from two different manifest
//                                             versions. Fail instead and
//                                             tell the human to commit the
//                                             fix. (some-censor is
//                                             1.1.0/1.0.0 drifted today —
//                                             this is a live case, not a
//                                             hypothetical.)
import fs from "node:fs"
import path from "node:path"

function fail(message) {
  process.stderr.write(`::error::${message}\n`)
  throw new Error(message)
}

function main() {
  const args = process.argv.slice(2)
  const checkOnly = args.includes("--check")
  const extensionDir = args.find((arg) => !arg.startsWith("--"))
  if (!extensionDir) {
    fail("Usage: sync-manifest-version.mjs [--check] <extension-dir>")
  }

  const pkgPath = path.join(extensionDir, "package.json")
  const manifestPath = path.join(
    extensionDir,
    "public",
    "manifest.firefox.json"
  )

  if (!fs.existsSync(manifestPath)) {
    process.stdout.write(
      `sync-manifest-version: ${manifestPath} doesn't exist — this extension doesn't use the manifest.firefox.json convention, skipping\n`
    )
    return
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"))
  const version = pkg.version
  if (!version) {
    fail(`${pkgPath} has no "version" field`)
  }

  const manifestRaw = fs.readFileSync(manifestPath, "utf8")
  const manifest = JSON.parse(manifestRaw)

  if (manifest.version === version) {
    process.stdout.write(
      `sync-manifest-version: ${manifestPath} already at ${version}\n`
    )
    return
  }

  if (checkOnly) {
    fail(
      `${manifestPath} is at ${manifest.version} but ${pkgPath} is at ${version}. Run "node extensions/scripts/sync-manifest-version.mjs ${extensionDir}", review the diff, and commit it before signing.`
    )
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
