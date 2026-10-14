#!/usr/bin/env node
// The reviewer side of extension-release.yml: what an AMO reviewer is told
// about a version, and the proof that the text belongs to the build it is
// submitted with. Two files under <extension>/release/ carry it:
//
//   notes.md      The two AMO text fields, written by an agent (or a person)
//                 from the evidence below: "Version notes" (public) and
//                 "Notes for reviewers". A header comment pins the version
//                 they describe and the content digest of the build they were
//                 written against.
//   release.json  Machine record of a release (on main) or of the candidate
//                 (on the release branch): version, the main commit its source
//                 came from, the content digest, every dist/ file's SHA-256,
//                 the manifest, and the exact AMO payload. Written only by
//                 this script.
//
// The content digest hashes every dist/ file, with `version` removed from
// the manifests, so the bump a release makes does not change it. Two builds
// with the same digest ship the same code; that is how a release PR knows
// whether a push to main changed anything a reviewer would see, and whether
// notes written earlier still describe the build.
//
// Commands (all take the extension directory, e.g. extensions/suspender-ledger,
// and read its freshly built dist/):
//
//   evidence  Print what changed since the baseline: permission and content
//             script deltas, built files, commits. Input for writing notes.md.
//   check     Validate notes.md against the build (what the release PR will
//             say), without changing anything.
//   prepare   Release PR job. Picks notes (--branch-notes first, then the
//             working tree's), validates them and writes the PR body (--body).
//             Ready: bumps package.json and the manifest and adds the
//             CHANGELOG.md section. Not ready: writes release/evidence.md, so
//             the draft PR has a diff and the agent writing notes has CI's
//             digest. Writes changed/ready/version to $GITHUB_OUTPUT.
//   record    Release PR job, after `prepare` reported ready and the
//             extension was rebuilt at the new version: writes release.json.
//   sign      Sign job. Refuses unless the dist/ being signed is byte-for-byte
//             the one release.json records, then writes
//             artifacts/amo-metadata.json from release.json's payload.
//             Extensions without release/release.json are skipped (they sign
//             through extension-sign-manual.yml with the dashboard's notes);
//             one with it signs only a release commit.
//
// The baseline is release.json at the newest `<name>@<version>` tag, which
// extension-release.yml pushes only after AMO accepted the upload, so a
// release commit that was merged but never submitted is not a baseline.
// Before the first such tag it is the bootstrap record (the commit that added
// release.json). --base-ref <ref> overrides that; "." reads the working
// tree's copy.
import { execFileSync } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { ROOT_BUILD_INPUTS, workspaceClosure } from "./source-closure.mjs"
import { withVersion } from "./sync-manifest-version.mjs"

// AMO's limit for both fields (addons-server versions/models.py).
export const MAX_FIELD = 3000
const LOCALE = "en-US"
const PLACEHOLDER_RE =
  /\b(TODO|TBD|FIXME|XXX)\b|\(draft\)|lorem ipsum|<fill|describe what changed/i
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/
const MANIFESTS = new Set(["manifest.json", "manifest.firefox.json"])

const VERSION_NOTES = "Version notes"
const REVIEWER_NOTES = "Notes for reviewers"
const GENERATED_RULE = "--- Generated from the build, not written by hand ---"

class ReleaseError extends Error {}

function fail(message) {
  throw new ReleaseError(message)
}

const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex")

// ── Build inventory ──────────────────────────────────────────────────────

function listFiles(dir, prefix = "") {
  const out = []
  for (const entry of fs.readdirSync(path.join(dir, prefix), {
    withFileTypes: true,
  })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...listFiles(dir, rel))
    else out.push(rel)
  }
  return out.sort()
}

/** Raw SHA-256 of every file under dist/, keyed by its relative path. */
export function hashDist(distDir) {
  if (!fs.existsSync(path.join(distDir, "manifest.json"))) {
    fail(`${distDir}/manifest.json not found. Build the extension first.`)
  }
  const files = {}
  for (const rel of listFiles(distDir)) {
    files[rel] = sha256(fs.readFileSync(path.join(distDir, rel)))
  }
  return files
}

/** Per-file hashes with the manifests' `version` removed. */
export function normalizedHashes(distDir) {
  const files = {}
  for (const rel of listFiles(distDir)) {
    const raw = fs.readFileSync(path.join(distDir, rel))
    if (MANIFESTS.has(rel)) {
      const { version: _version, ...rest } = JSON.parse(raw.toString("utf8"))
      files[rel] = sha256(JSON.stringify(rest))
    } else {
      files[rel] = sha256(raw)
    }
  }
  return files
}

/** One digest over a normalized file map: equal digests ship equal code. */
export function contentDigest(normalized) {
  const lines = Object.keys(normalized)
    .sort()
    .map((rel) => `${rel} ${normalized[rel]}\n`)
  return `sha256:${sha256(lines.join(""))}`
}

function readCandidate(extDir) {
  const distDir = path.join(extDir, "dist")
  const normalized = normalizedHashes(distDir)
  const manifest = JSON.parse(
    fs.readFileSync(path.join(distDir, "manifest.json"), "utf8")
  )
  const { version, ...rest } = manifest
  return {
    version,
    manifest: rest,
    normalized,
    content: contentDigest(normalized),
  }
}

// ── Versions ──────────────────────────────────────────────────────────────

function parseSemver(v) {
  const m = SEMVER_RE.exec(v ?? "")
  if (!m) fail(`"${v}" is not a plain x.y.z version`)
  return m.slice(1).map(Number)
}

/** The only versions a release may take after `baseline`: no skipping. */
export function nextVersions(baseline) {
  const [maj, min, pat] = parseSemver(baseline)
  return {
    patch: `${maj}.${min}.${pat + 1}`,
    minor: `${maj}.${min + 1}.0`,
    major: `${maj + 1}.0.0`,
  }
}

// ── notes.md ──────────────────────────────────────────────────────────────

/**
 * notes.md: an `<!-- amo-release ... -->` header of `key: value` lines, then
 * `## Version notes` and `## Notes for reviewers`. Everything under each
 * heading, trimmed, is the field's text.
 */
export function parseNotes(text) {
  const header = /<!--\s*amo-release\s*\n([\s\S]*?)-->/.exec(text)
  const meta = {}
  if (header) {
    for (const line of header[1].split("\n")) {
      const m = /^\s*([a-z]+)\s*:\s*(.*?)\s*$/.exec(line)
      if (m) meta[m[1]] = m[2]
    }
  }
  const body = header ? text.slice(header.index + header[0].length) : text
  const sections = {}
  let current = null
  for (const line of body.split("\n")) {
    const heading = /^##\s+(.+?)\s*$/.exec(line)
    if (heading) {
      current = heading[1]
      sections[current] = []
    } else if (current) {
      sections[current].push(line)
    }
  }
  const field = (name) =>
    sections[name] === undefined ? undefined : sections[name].join("\n").trim()
  return {
    hasHeader: Boolean(header),
    otherSections: Object.keys(sections).filter(
      (name) => name !== VERSION_NOTES && name !== REVIEWER_NOTES
    ),
    version: meta.version,
    content: meta.content,
    rationale: meta.rationale,
    releaseNotes: field(VERSION_NOTES),
    reviewerProse: field(REVIEWER_NOTES),
  }
}

/**
 * Problems that make notes unusable for `candidate`. An empty list means the
 * notes describe exactly this build, at an allowed next version.
 */
export function notesProblems(notes, { baseline, candidate }) {
  const problems = []
  if (!notes.hasHeader) {
    return ["no <!-- amo-release ... --> header"]
  }
  const allowed = Object.values(nextVersions(baseline.version))
  if (!allowed.includes(notes.version)) {
    problems.push(
      `version "${notes.version ?? ""}" is not one of ${allowed.join(", ")} (the next patch, minor or major after ${baseline.version})`
    )
  }
  if (!DIGEST_RE.test(notes.content ?? "")) {
    problems.push(
      `content "${notes.content ?? ""}" is not a sha256:<hex> digest`
    )
  } else if (notes.content !== candidate.content) {
    problems.push(
      `written for build ${notes.content}, but the build is ${candidate.content}: the notes are stale`
    )
  }
  if (!notes.rationale) {
    problems.push("no `rationale:` line saying why this bump")
  }
  for (const name of notes.otherSections) {
    problems.push(
      `"## ${name}" is not a field: only "## ${VERSION_NOTES}" and "## ${REVIEWER_NOTES}" are submitted, so its text would be lost`
    )
  }
  for (const [name, value] of [
    [VERSION_NOTES, notes.releaseNotes],
    [REVIEWER_NOTES, notes.reviewerProse],
  ]) {
    if (value === undefined) problems.push(`no "## ${name}" section`)
    else if (value === "") problems.push(`"## ${name}" is empty`)
  }
  for (const value of [
    notes.rationale,
    notes.releaseNotes,
    notes.reviewerProse,
  ]) {
    const hit = value && PLACEHOLDER_RE.exec(value)
    if (hit) problems.push(`placeholder text "${hit[0]}"`)
  }
  return problems
}

// ── Evidence ──────────────────────────────────────────────────────────────

const show = (value) =>
  value === undefined || value === null ? "not declared" : value

function contentScripts(m) {
  const scripts = m.content_scripts ?? []
  if (scripts.length === 0) return "none"
  return scripts
    .map((cs) => {
      const files = [...(cs.js ?? []), ...(cs.css ?? [])].join(", ")
      const frames = cs.all_frames ? ", all frames" : ""
      return `${files} at ${cs.run_at ?? "document_idle"} on ${(cs.matches ?? []).join(" ")}${frames}`
    })
    .join("; ")
}

function webAccessible(m) {
  const entries = m.web_accessible_resources ?? []
  if (entries.length === 0) return "none"
  return entries
    .map((e) =>
      typeof e === "string"
        ? e
        : `${(e.resources ?? []).join(", ")} for ${(e.matches ?? []).join(" ")}`
    )
    .join("; ")
}

function csp(m) {
  const value = m.content_security_policy
  if (value === undefined) return "not declared"
  if (typeof value === "string") return value
  return Object.entries(value)
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ")
}

const list = (items) => (items && items.length > 0 ? items.join(", ") : "none")

/** The manifest facts a reviewer checks first, as display strings. */
const SURFACE = [
  ["Permissions", (m) => list(m.permissions)],
  ["Optional permissions", (m) => list(m.optional_permissions)],
  ["Host permissions", (m) => list(m.host_permissions)],
  ["Content scripts", contentScripts],
  ["Content security policy", csp],
  ["Web-accessible resources", webAccessible],
  [
    "Data collection",
    (m) => {
      const d = m.browser_specific_settings?.gecko?.data_collection_permissions
      return d ? JSON.stringify(d) : "not declared"
    },
  ],
  [
    "Externally connectable",
    (m) =>
      m.externally_connectable
        ? JSON.stringify(m.externally_connectable)
        : "not declared",
  ],
  ["Background", (m) => show(m.background && JSON.stringify(m.background))],
  ["Add-on ID", (m) => show(m.browser_specific_settings?.gecko?.id)],
]

export function surfaceRows(baseManifest, candManifest) {
  return SURFACE.map(([label, read]) => {
    const before = read(baseManifest)
    const after = read(candManifest)
    return { label, before, after, changed: before !== after }
  })
}

/** Top-level manifest keys outside SURFACE that differ (name, icons, ...). */
export function otherManifestChanges(baseManifest, candManifest) {
  const covered = new Set([
    "permissions",
    "optional_permissions",
    "host_permissions",
    "content_scripts",
    "content_security_policy",
    "web_accessible_resources",
    "externally_connectable",
    "background",
  ])
  const keys = new Set([
    ...Object.keys(baseManifest),
    ...Object.keys(candManifest),
  ])
  return [...keys]
    .filter((k) => !covered.has(k))
    .filter((k) => {
      if (k !== "browser_specific_settings") {
        return (
          JSON.stringify(baseManifest[k]) !== JSON.stringify(candManifest[k])
        )
      }
      // data_collection_permissions and id have their own rows.
      const strip = (m) => {
        const {
          data_collection_permissions: _d,
          id: _i,
          ...gecko
        } = m.browser_specific_settings?.gecko ?? {}
        return JSON.stringify({ ...m.browser_specific_settings, gecko })
      }
      return strip(baseManifest) !== strip(candManifest)
    })
    .sort()
}

/** Added/changed/removed dist files, by normalized hash. */
export function fileDelta(baseFiles, candFiles) {
  if (!baseFiles) return null
  const added = []
  const changed = []
  const removed = []
  for (const rel of Object.keys(candFiles).sort()) {
    if (!(rel in baseFiles)) added.push(rel)
    else if (baseFiles[rel] !== candFiles[rel]) changed.push(rel)
  }
  for (const rel of Object.keys(baseFiles).sort()) {
    if (!(rel in candFiles)) removed.push(rel)
  }
  return { added, changed, removed }
}

/**
 * The generated tail of the reviewer notes. Every "unchanged" in it is a
 * comparison of the two builds' manifests, never a claim from prose.
 */
export function generatedReviewerBlock({
  extRel,
  baseline,
  rows,
  delta,
  other,
}) {
  const lines = [
    GENERATED_RULE,
    "The uploaded source archive is `git archive` of the release commit (its id is the zip comment), with package.json and pnpm-lock.yaml pruned to what this extension builds from.",
    `Build steps: ${extRel}/README.build.md. Expected SHA-256 of every dist/ file: ${extRel}/release/release.json.`,
    `Compared with ${baseline.version} (source at commit ${baseline.commit.slice(0, 12)}):`,
  ]
  for (const row of rows) {
    lines.push(
      row.changed
        ? `- ${row.label}: CHANGED from "${row.before}" to "${row.after}"`
        : `- ${row.label}: unchanged (${row.after})`
    )
  }
  if (other.length > 0) {
    lines.push(`- Other manifest keys changed: ${other.join(", ")}`)
  }
  if (delta) {
    lines.push(
      `- Built files: added ${list(delta.added)}; changed ${list(delta.changed)}; removed ${list(delta.removed)}`
    )
  } else {
    lines.push(`- Built files: no per-file record for ${baseline.version}`)
  }
  return lines.join("\n")
}

export function amoPayload(notes, generated) {
  return {
    release_notes: notes.releaseNotes,
    approval_notes: `${notes.reviewerProse}\n\n${generated}`,
  }
}

export function payloadProblems(payload) {
  const problems = []
  for (const [field, value] of Object.entries(payload)) {
    if (!value || !value.trim()) problems.push(`${field} is empty`)
    else if (value.length > MAX_FIELD) {
      problems.push(
        `${field} is ${value.length} characters; AMO caps it at ${MAX_FIELD}`
      )
    }
  }
  return problems
}

// ── git and the workspace ─────────────────────────────────────────────────

function git(args, opts = {}) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", opts.quiet ? "ignore" : "inherit"],
    maxBuffer: 64 * 1024 * 1024,
  })
}

/**
 * The newest `<name>@<version>` tag. Before the first one, the commit that
 * added release.json (its bootstrap record), never main's head: a release
 * merged there whose submission failed is not a baseline.
 */
function defaultBaseRef(extRel) {
  if (git(["rev-parse", "--is-shallow-repository"]).trim() === "true") {
    fail(
      "This clone is shallow, so the baseline cannot be found. Run `git fetch --unshallow --tags origin` first."
    )
  }
  // A clone (an agent's, say) may never have fetched the tags.
  try {
    git(["fetch", "--quiet", "--tags", "origin"], { quiet: true })
  } catch {
    // Offline: the local tags are the best answer there is.
  }
  const [newest] = git([
    "tag",
    "--list",
    `${path.basename(extRel)}@*`,
    "--sort=-version:refname",
  ])
    .split("\n")
    .filter(Boolean)
  if (newest) return newest
  const [bootstrap] = git([
    "log",
    "--diff-filter=A",
    "--format=%H",
    "--reverse",
    "--",
    `${extRel}/release/release.json`,
  ])
    .split("\n")
    .filter(Boolean)
  return bootstrap ?? "origin/main"
}

function readBaseline(extRel, baseRef = defaultBaseRef(extRel)) {
  // "." reads the working tree's copy (for trying a baseline before it is committed).
  if (baseRef === ".") {
    return JSON.parse(
      fs.readFileSync(path.join(extRel, "release", "release.json"), "utf8")
    )
  }
  let raw
  try {
    raw = git(["show", `${baseRef}:${extRel}/release/release.json`], {
      quiet: true,
    })
  } catch {
    fail(
      `No ${extRel}/release/release.json at ${baseRef}: there is no baseline to compare against.`
    )
  }
  return JSON.parse(raw)
}

const NOT_TESTS = [
  ":(exclude,glob)**/__tests__/**",
  ":(exclude,glob)**/*.test.*",
  ":(exclude,glob)**/*.stories.*",
]

/** Commits since the baseline that touched anything the build reads. */
function commitsSince(extRel, baseCommit) {
  const scope = [
    ...workspaceClosure(extRel).dirs,
    ...ROOT_BUILD_INPUTS,
    "pnpm-lock.yaml",
    "package.json",
    ...NOT_TESTS,
  ]
  const shipped = new RegExp(
    `^(${extRel}/(src|public|[^/]+\\.html|vite\\.config\\.ts)|extensions/common/(src|vite)/)`
  )
  const out = git([
    "log",
    "--format=%x00%h%x09%ad%x09%s",
    "--date=short",
    "--name-only",
    `${baseCommit}..HEAD`,
    "--",
    ...scope,
  ])
  return out
    .split("\0")
    .filter(Boolean)
    .map((chunk) => {
      const [head, ...paths] = chunk.trim().split("\n")
      const [hash, date, subject] = head.split("\t")
      const touched = paths.filter(Boolean)
      return {
        hash,
        date,
        subject,
        source: touched.some((p) => shipped.test(p)),
      }
    })
}

function sourceDiffstat(extRel, baseCommit) {
  return git([
    "diff",
    "--stat=100",
    baseCommit,
    "HEAD",
    "--",
    `${extRel}/src`,
    `${extRel}/public`,
    `${extRel}/*.html`,
    "extensions/common/src",
    ...NOT_TESTS,
  ]).trimEnd()
}

// ── Rendering ─────────────────────────────────────────────────────────────

function fence(text) {
  return `~~~~text\n${text}\n~~~~`
}

// A table cell showing a value verbatim, so a host pattern does not turn italic.
const cell = (value) => `\`${value.replaceAll("|", "\\|")}\``

function surfaceTable(baseline, version, rows, other) {
  const out = [
    `| | ${baseline.version} | ${version} |`,
    "| --- | --- | --- |",
    ...rows.map(
      (r) =>
        `| ${r.changed ? `**${r.label} (changed)**` : r.label} | ${cell(r.before)} | ${r.changed ? cell(r.after) : "unchanged"} |`
    ),
  ]
  if (other.length > 0)
    out.push("", `Other manifest keys changed: ${other.join(", ")}.`)
  return out.join("\n")
}

function deltaLines(delta) {
  if (!delta) return "- No per-file record for the baseline."
  return [
    `- Added: ${list(delta.added)}`,
    `- Changed: ${list(delta.changed)}`,
    `- Removed: ${list(delta.removed)}`,
  ].join("\n")
}

function commitLines(commits) {
  if (commits.length === 0) return "None."
  return commits.map((c) => `- ${c.hash} ${c.date} ${c.subject}`).join("\n")
}

function commitSections(commits) {
  const source = commits.filter((c) => c.source)
  const tooling = commits.filter((c) => !c.source)
  return `Touched shipped source (the extension's src/, public/, HTML or vite config, or extensions/common's src/ and vite/):

${commitLines(source)}

<details><summary>${tooling.length} more touched only tests, lint, types, build config or dependencies</summary>

The built files say whether any of these reached the bundle.

${commitLines(tooling)}

</details>`
}

export function evidenceMarkdown(ev) {
  const { extRel, baseline, candidate, rows, other, delta, commits, diffstat } =
    ev
  const next = nextVersions(baseline.version)
  return `# Release evidence: ${extRel}

Generated by \`extensions/scripts/amo-release.mjs\`; every line is computed, none is written by hand.

- Baseline: ${baseline.version}, built from commit ${baseline.commit}
- Candidate: built from commit ${candidate.commit}
- Candidate content digest: \`${candidate.content}\`
- Allowed versions: patch ${next.patch}, minor ${next.minor}, major ${next.major}

## Review-sensitive manifest surface

${surfaceTable(baseline, "candidate", rows, other)}

## Built files (dist/)

${deltaLines(delta)}

## Commits since the baseline

${commitSections(commits)}

## Shipped-source diffstat (tests excluded)

${fence(diffstat || "(no changes)")}
`
}

function prBody({ status, problems, ev, notes, payload }) {
  const { baseline, candidate, rows, other, delta, commits } = ev
  const version = status === "ready" ? notes.version : "next"
  const banner = {
    ready: `✅ **Ready.** The notes below describe this exact build. Skim the two AMO fields and the surface table, then **squash-merge** to sign ${notes?.version} and submit it to AMO.`,
    missing: `⛔ **Notes needed.** Nothing describes this build for AMO yet, so this PR is a draft and must not be merged.`,
    stale: `⛔ **Notes are stale or invalid.** This PR is a draft until they are fixed:\n${problems.map((p) => `- ${p}`).join("\n")}`,
  }[status]
  const howTo =
    status === "ready"
      ? ""
      : `
**To fix it:** in a Claude Code session on this repo, run \`/amo-release-notes\`. It reads the evidence, writes \`${ev.extRel}/release/notes.md\` and pushes it to this branch; this PR then refreshes itself in a few minutes. (By hand: the skill's \`SKILL.md\` describes the file.)
`
  const fields =
    status === "ready"
      ? `
**Version:** ${baseline.version} → **${notes.version}**. ${notes.rationale}

### AMO "Version notes" (public), exactly as submitted

${fence(payload.release_notes)}

### AMO "Notes for reviewers", exactly as submitted

${fence(payload.approval_notes)}
`
      : ""
  const body = `## ${path.basename(ev.extRel)} release: ${baseline.version} → ${version}

${banner}
${howTo}${fields}
### Review-sensitive manifest surface vs ${baseline.version}

${surfaceTable(baseline, version, rows, other)}

### Built files vs ${baseline.version}

${deltaLines(delta)}

### Commits since ${baseline.version}

${commitSections(commits)}

### Provenance

- Baseline ${baseline.version}: commit ${baseline.commit}, content \`${baseline.content}\`
- Candidate: built from main at ${candidate.commit}, content \`${candidate.content}\`
- The sign job rebuilds from the merge commit and refuses to submit unless every dist/ file matches \`release/release.json\`.
- Opened by \`extension-release.yml\`; regenerated from \`main\` on every push that can change the build. Only \`${ev.extRel}/release/notes.md\` carries over from this branch, so edit nothing else here.
`
  // GitHub's limit on a PR body is 65536 characters.
  return body.length > 60000
    ? `${body.slice(0, 60000)}\n\n…(truncated)\n`
    : body
}

// ── Commands ──────────────────────────────────────────────────────────────

function gatherEvidence(extDir, baseRef) {
  const extRel = extDir
  const baseline = readBaseline(extRel, baseRef)
  const candidate = {
    ...readCandidate(extDir),
    commit: git(["rev-parse", "HEAD"]).trim(),
  }
  return {
    extRel,
    baseline,
    candidate,
    rows: surfaceRows(baseline.manifest, candidate.manifest),
    other: otherManifestChanges(baseline.manifest, candidate.manifest),
    delta: fileDelta(baseline.normalized, candidate.normalized),
    commits: commitsSince(extRel, baseline.commit),
    diffstat: sourceDiffstat(extRel, baseline.commit),
  }
}

function evaluate(ev, notesText) {
  const notes = notesText === undefined ? undefined : parseNotes(notesText)
  if (!notes) return { status: "missing", problems: [], notes }
  if (!notes.hasHeader) {
    return { status: "stale", problems: notesProblems(notes, ev), notes }
  }
  // Notes for the baseline itself (what main keeps after a release), or for
  // anything older, are not notes for this candidate. A malformed version
  // falls through to notesProblems, which says what is wrong with it.
  if (
    SEMVER_RE.test(notes.version ?? "") &&
    !isNewer(notes.version, ev.baseline.version)
  ) {
    return { status: "missing", problems: [], notes }
  }
  const problems = notesProblems(notes, ev)
  if (problems.length > 0) return { status: "stale", problems, notes }
  const generated = generatedReviewerBlock(ev)
  const payload = amoPayload(notes, generated)
  const sizeProblems = payloadProblems(payload)
  if (sizeProblems.length > 0)
    return { status: "stale", problems: sizeProblems, notes }
  return { status: "ready", problems: [], notes, payload }
}

function readIfExists(file) {
  return file && fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined
}

function isNewer(version, than) {
  if (!SEMVER_RE.test(version ?? "")) return false
  const [a, b] = [parseSemver(version), parseSemver(than)]
  return (a[0] - b[0] || a[1] - b[1] || a[2] - b[2]) > 0
}

/**
 * The branch's notes unless they are the baseline's own (left over from the
 * last release): even malformed or headerless ones, so the PR says what is
 * wrong with them instead of dropping them.
 */
export function pickNotes(baseline, branchNotes, treeNotes) {
  if (
    branchNotes !== undefined &&
    parseNotes(branchNotes).version !== baseline.version
  ) {
    return branchNotes
  }
  return treeNotes
}

/**
 * Main's own record names a release newer than the baseline and is this very
 * build: that release is merged and still signing (its tag not pushed yet), or
 * its submission failed and wants a publish_only retry. Either way there is
 * nothing new to open a release PR for.
 */
export function awaitingSubmission(mainRecord, { baseline, candidate }) {
  return (
    mainRecord !== undefined &&
    isNewer(mainRecord.version, baseline.version) &&
    mainRecord.content === candidate.content
  )
}

function writeOutputs(outputs) {
  const lines = Object.entries(outputs).map(([k, v]) => `${k}=${v}\n`)
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join(""))
  process.stdout.write(lines.join(""))
}

function setVersion(file, version) {
  fs.writeFileSync(file, withVersion(fs.readFileSync(file, "utf8"), version))
}

/** Insert `## <version>` under the changelog's title line. */
export function withChangelogSection(raw, version, releaseNotes) {
  if (raw.split("\n").includes(`## ${version}`)) return raw
  const [title, ...rest] = raw.split("\n")
  const previous = rest.join("\n").replace(/^\n+/, "")
  return `${title}\n\n## ${version}\n\n${releaseNotes}\n${previous ? `\n${previous}` : ""}`
}

function cmdEvidence(extDir, opts) {
  process.stdout.write(evidenceMarkdown(gatherEvidence(extDir, opts.baseRef)))
}

function cmdCheck(extDir, opts) {
  const ev = gatherEvidence(extDir, opts.baseRef)
  const notesPath = path.join(extDir, "release", "notes.md")
  const result = evaluate(ev, readIfExists(notesPath))
  if (result.status !== "ready") {
    const why =
      result.status === "missing"
        ? [
            `${notesPath} has no notes for a version after ${ev.baseline.version}`,
          ]
        : result.problems
    fail(`Notes are not ready:\n${why.map((p) => `  - ${p}`).join("\n")}`)
  }
  process.stdout.write(
    `Ready: ${ev.baseline.version} -> ${result.notes.version} (${ev.candidate.content})\n` +
      `release_notes ${result.payload.release_notes.length}/${MAX_FIELD} chars, ` +
      `approval_notes ${result.payload.approval_notes.length}/${MAX_FIELD} chars\n\n` +
      `${result.payload.approval_notes}\n`
  )
}

function readMainRecord(extRel) {
  try {
    return readBaseline(extRel, "HEAD")
  } catch {
    return undefined
  }
}

function cmdPrepare(extDir, opts) {
  const ev = gatherEvidence(extDir, opts.baseRef)
  const notesPath = path.join(extDir, "release", "notes.md")
  const branchNotes = readIfExists(opts.branchNotes)
  // New notes pushed to the branch reopen a release that is merged but never
  // submitted (a failed upload that needs different notes, not new code).
  const newBranchNotes =
    branchNotes !== undefined && branchNotes !== readIfExists(notesPath)
  if (
    ev.candidate.content === ev.baseline.content ||
    (!newBranchNotes && awaitingSubmission(readMainRecord(extDir), ev))
  ) {
    writeOutputs({
      changed: "false",
      ready: "false",
      version: ev.baseline.version,
    })
    return
  }
  const notesText = pickNotes(ev.baseline, branchNotes, readIfExists(notesPath))
  if (notesText !== undefined) fs.writeFileSync(notesPath, notesText)
  const result = evaluate(ev, notesText)
  const evidencePath = path.join(extDir, "release", "evidence.md")
  if (result.status === "ready") fs.rmSync(evidencePath, { force: true })
  else fs.writeFileSync(evidencePath, evidenceMarkdown(ev))
  if (opts.body) fs.writeFileSync(opts.body, prBody({ ...result, ev }))
  if (result.status === "ready") {
    const version = result.notes.version
    setVersion(path.join(extDir, "package.json"), version)
    setVersion(path.join(extDir, "public", "manifest.firefox.json"), version)
    const changelog = path.join(extDir, "CHANGELOG.md")
    const raw = fs.existsSync(changelog)
      ? fs.readFileSync(changelog, "utf8")
      : `# ${ev.extRel}\n`
    fs.writeFileSync(
      changelog,
      withChangelogSection(raw, version, result.notes.releaseNotes)
    )
  }
  writeOutputs({
    changed: "true",
    ready: String(result.status === "ready"),
    version: result.status === "ready" ? result.notes.version : "",
  })
}

function cmdRecord(extDir, opts) {
  const ev = gatherEvidence(extDir, opts.baseRef)
  const result = evaluate(
    ev,
    readIfExists(path.join(extDir, "release", "notes.md"))
  )
  if (result.status !== "ready")
    fail(`record: notes are ${result.status}; run prepare first`)
  if (ev.candidate.version !== result.notes.version) {
    fail(
      `record: dist/ is at ${ev.candidate.version}, not ${result.notes.version}. Rebuild after prepare.`
    )
  }
  const record = {
    version: result.notes.version,
    commit: ev.candidate.commit,
    content: ev.candidate.content,
    baseline: { version: ev.baseline.version, commit: ev.baseline.commit },
    files: hashDist(path.join(extDir, "dist")),
    normalized: ev.candidate.normalized,
    manifest: ev.candidate.manifest,
    amo: result.payload,
  }
  fs.writeFileSync(
    path.join(extDir, "release", "release.json"),
    `${JSON.stringify(record, null, 2)}\n`
  )
  process.stdout.write(`release.json: ${record.version} (${record.content})\n`)
}

/** Problems that stop a sign: the dist/ being signed must be the one reviewed. */
export function signProblems(record, { packageVersion, distFiles }) {
  const problems = []
  if (record.version !== packageVersion) {
    problems.push(
      `release.json is for ${record.version} but package.json is at ${packageVersion}`
    )
  }
  if (!record.amo) {
    problems.push(
      `release.json has no AMO payload for ${record.version} (the baseline record is not a release)`
    )
  } else {
    problems.push(...payloadProblems(record.amo))
    for (const [field, value] of Object.entries(record.amo)) {
      const hit = value && PLACEHOLDER_RE.exec(value)
      if (hit) problems.push(`${field} contains placeholder text "${hit[0]}"`)
    }
  }
  const differ = Object.keys({ ...record.files, ...distFiles })
    .sort()
    .filter((rel) => record.files?.[rel] !== distFiles[rel])
  if (differ.length > 0) {
    problems.push(
      `dist/ is not the build the release PR reviewed; these files differ from release.json: ${differ.join(", ")}`
    )
  }
  return problems
}

function cmdSign(extDir) {
  const recordPath = path.join(extDir, "release", "release.json")
  if (!fs.existsSync(recordPath)) {
    process.stdout.write(
      `amo-release: no ${recordPath}; signing without AMO metadata (dashboard notes apply)\n`
    )
    return
  }
  const record = JSON.parse(fs.readFileSync(recordPath, "utf8"))
  const packageVersion = JSON.parse(
    fs.readFileSync(path.join(extDir, "package.json"), "utf8")
  ).version
  const problems = signProblems(record, {
    packageVersion,
    distFiles: hashDist(path.join(extDir, "dist")),
  })
  if (problems.length > 0) {
    fail(`Refusing to sign:\n${problems.map((p) => `  - ${p}`).join("\n")}`)
  }
  const outDir = path.join(extDir, "artifacts")
  fs.mkdirSync(outDir, { recursive: true })
  const metadata = {
    version: {
      release_notes: { [LOCALE]: record.amo.release_notes },
      approval_notes: record.amo.approval_notes,
    },
  }
  fs.writeFileSync(
    path.join(outDir, "amo-metadata.json"),
    `${JSON.stringify(metadata, null, 2)}\n`
  )
  process.stdout.write(
    `::notice::amo-release: ${record.version} matches its release record; wrote ${outDir}/amo-metadata.json\n`
  )
}

const COMMANDS = {
  evidence: cmdEvidence,
  check: cmdCheck,
  prepare: cmdPrepare,
  record: cmdRecord,
  sign: cmdSign,
}

function parseArgs(argv) {
  const [command, extDir, ...rest] = argv
  const opts = {}
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i]
      .replace(/^--/, "")
      .replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    opts[key] = rest[i + 1]
  }
  return { command, extDir, opts }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { command, extDir: given, opts } = parseArgs(process.argv.slice(2))
  const run = COMMANDS[command]
  // Paths in git pathspecs and the workspace scan are repo-relative.
  const root = git(["rev-parse", "--show-toplevel"]).trim()
  const extDir = given && path.relative(root, path.resolve(given))
  for (const key of ["body", "branchNotes"]) {
    if (opts[key]) opts[key] = path.resolve(opts[key])
  }
  process.chdir(root)
  if (!run || !extDir) {
    process.stderr.write(
      `Usage: amo-release.mjs <${Object.keys(COMMANDS).join("|")}> <extension-dir> [--base-ref <ref>] [--branch-notes <file>] [--body <file>]\n`
    )
    process.exitCode = 2
  } else {
    try {
      run(extDir, opts)
    } catch (error) {
      if (!(error instanceof ReleaseError)) throw error
      process.stderr.write(`::error::${error.message}\n`)
      process.exitCode = 1
    }
  }
}
