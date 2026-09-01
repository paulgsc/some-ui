#!/usr/bin/env node
// Builds the JSON file `web-ext sign --amo-metadata` submits to AMO: the
// public "Version Notes" (release_notes) and the private "Notes for
// Reviewers" (approval_notes) shown on the AMO developer hub's "Manage
// Version" page. Both used to be retyped by hand into that web form after
// every sign — this reads them from repo files a human already maintains
// for other reasons, so a sign never ships without them and nobody
// re-types either box again:
//   - release_notes  <- CHANGELOG.md's section for the current version
//                       (written by extension-release.yml's changeset flow)
//   - approval_notes <- README.build.md (the source-archive build
//                       instructions AMO already requires — see A1 in
//                       extensions/docs/amo-compliance.md)
//
// Skips gracefully (no file written) when the extension has no
// CHANGELOG.md — extensions that haven't opted into the automated release
// flow keep using the manual AMO-dashboard edit this replaces.
//
// AMO API field shapes, verified against addons-server's Version model
// (src/olympia/versions/models.py):
//   release_notes  -> PurifiedMarkdownField (a translated field), max 3000
//                     chars -> serialized as {"en-US": "..."} in the API
//   approval_notes -> plain (non-translated) TextField, max 3000 chars
//                     -> serialized as a plain string in the API
// web-ext's --amo-metadata nests both under a top-level "version" key: see
// web-ext's submit-addon.js, doNewAddonOrVersionSubmit(), which spreads
// metaDataJson.version into the PUT body alongside the upload id.
import fs from "node:fs"
import path from "node:path"

const MAX_LEN = 3000
const LOCALE = "en-US"

function fail(message) {
  process.stderr.write(`::error::${message}\n`)
  throw new Error(message)
}

function extractChangelogSection(changelog, targetVersion) {
  const lines = changelog.split("\n")
  const escaped = targetVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const headingRe = new RegExp(`^##\\s+${escaped}\\s*$`)
  const anyHeadingRe = /^##\s+/

  const start = lines.findIndex((line) => headingRe.test(line))
  if (start === -1) return null

  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (anyHeadingRe.test(lines[i])) {
      end = i
      break
    }
  }

  return lines.slice(start, end).join("\n").trim()
}

function main() {
  const extensionDir = process.argv[2]
  if (!extensionDir) {
    fail("Usage: build-amo-metadata.mjs <extension-dir>")
  }

  const pkgPath = path.join(extensionDir, "package.json")
  const changelogPath = path.join(extensionDir, "CHANGELOG.md")
  const buildInstructionsPath = path.join(extensionDir, "README.build.md")
  const outDir = path.join(extensionDir, "artifacts")
  const outPath = path.join(outDir, "amo-metadata.json")

  if (!fs.existsSync(changelogPath)) {
    process.stdout.write(
      `build-amo-metadata: no CHANGELOG.md in ${extensionDir} — skipping (this extension hasn't opted into automated AMO release notes)\n`
    )
    return
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"))
  const version = pkg.version
  if (!version) {
    fail(`${pkgPath} has no "version" field`)
  }

  const changelog = fs.readFileSync(changelogPath, "utf8")
  const releaseNotes = extractChangelogSection(changelog, version)
  if (!releaseNotes) {
    fail(
      `No "## ${version}" section found in ${changelogPath} — package.json's version and the changelog have drifted. Run the extension-release changeset flow (or edit CHANGELOG.md by hand) so they match before signing.`
    )
  }
  if (releaseNotes.length > MAX_LEN) {
    fail(
      `${changelogPath}'s "## ${version}" section is ${releaseNotes.length} chars — AMO's release_notes field caps at ${MAX_LEN}. Trim it before signing.`
    )
  }

  if (!fs.existsSync(buildInstructionsPath)) {
    fail(
      `${changelogPath} exists but ${buildInstructionsPath} does not — approval_notes needs it. Both files are required once an extension opts into automated AMO metadata.`
    )
  }
  const approvalNotes = fs.readFileSync(buildInstructionsPath, "utf8").trim()
  if (approvalNotes.length > MAX_LEN) {
    fail(
      `${buildInstructionsPath} is ${approvalNotes.length} chars — AMO's approval_notes field caps at ${MAX_LEN}. Trim it before signing.`
    )
  }

  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(
    outPath,
    `${JSON.stringify(
      {
        version: {
          release_notes: { [LOCALE]: releaseNotes },
          approval_notes: approvalNotes,
        },
      },
      null,
      2
    )}\n`
  )
  process.stdout.write(
    `::notice::build-amo-metadata: wrote ${outPath} for version ${version}\n`
  )
}

main()
