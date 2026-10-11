// Tests for amo-release.mjs: node --test extensions/scripts/amo-release.test.mjs
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

import {
  amoPayload,
  awaitingSubmission,
  contentDigest,
  fileDelta,
  generatedReviewerBlock,
  hashDist,
  MAX_FIELD,
  nextVersions,
  normalizedHashes,
  notesProblems,
  otherManifestChanges,
  parseNotes,
  payloadProblems,
  pickNotes,
  signProblems,
  surfaceRows,
  withChangelogSection,
} from "./amo-release.mjs"

const MANIFEST = {
  manifest_version: 3,
  name: "Example",
  version: "1.2.3",
  permissions: ["storage", "tabs"],
  host_permissions: ["*://*/*"],
  content_scripts: [{ matches: ["*://*/*"], js: ["watch.js"] }],
  browser_specific_settings: {
    gecko: { id: "x@y", data_collection_permissions: { required: ["none"] } },
  },
}

function dist(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amo-release-"))
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(
      path.join(dir, rel),
      typeof content === "string" ? content : JSON.stringify(content)
    )
  }
  return dir
}

function notesText({
  version = "1.3.0",
  content = `sha256:${"a".repeat(64)}`,
  rationale = "Minor: adds a page.",
  versionNotes = "- Adds a page.",
  reviewer = "The page is local.",
} = {}) {
  return `<!-- amo-release
version: ${version}
content: ${content}
rationale: ${rationale}
-->

## Version notes

${versionNotes}

## Notes for reviewers

${reviewer}
`
}

const ev = {
  baseline: { version: "1.2.3", commit: "0123456789abcdef" },
  candidate: { content: `sha256:${"a".repeat(64)}` },
}

test("the content digest ignores the manifest version and nothing else", () => {
  const a = dist({ "manifest.json": MANIFEST, "worker.js": "1" })
  const b = dist({
    "manifest.json": { ...MANIFEST, version: "9.9.9" },
    "worker.js": "1",
  })
  const c = dist({ "manifest.json": MANIFEST, "worker.js": "2" })
  const digest = (d) => contentDigest(normalizedHashes(d))
  assert.equal(digest(a), digest(b))
  assert.notEqual(digest(a), digest(c))
  // Raw hashes are what a reviewer checks with sha256sum: the version counts.
  assert.notEqual(hashDist(a)["manifest.json"], hashDist(b)["manifest.json"])
})

test("a release may only take the next patch, minor or major version", () => {
  assert.deepEqual(nextVersions("0.2.1"), {
    patch: "0.2.2",
    minor: "0.3.0",
    major: "1.0.0",
  })
  for (const version of ["0.2.2", "0.3.0", "1.0.0"]) {
    const notes = parseNotes(notesText({ version }))
    const problems = notesProblems(notes, {
      ...ev,
      baseline: { ...ev.baseline, version: "0.2.1" },
    })
    assert.deepEqual(problems, [], version)
  }
  for (const version of ["0.2.1", "0.2.3", "0.4.0", "0.3.1", "v0.3.0"]) {
    const notes = parseNotes(notesText({ version }))
    const problems = notesProblems(notes, {
      ...ev,
      baseline: { ...ev.baseline, version: "0.2.1" },
    })
    assert.equal(problems.length, 1, version)
    assert.match(problems[0], /is not one of/)
  }
})

test("notes parse into their header and two fields", () => {
  const notes = parseNotes(notesText())
  assert.equal(notes.version, "1.3.0")
  assert.equal(notes.rationale, "Minor: adds a page.")
  assert.equal(notes.releaseNotes, "- Adds a page.")
  assert.equal(notes.reviewerProse, "The page is local.")
  assert.deepEqual(notesProblems(notes, ev), [])
})

test("notes written for another build are stale", () => {
  const notes = parseNotes(notesText({ content: `sha256:${"b".repeat(64)}` }))
  const [problem] = notesProblems(notes, ev)
  assert.match(problem, /stale/)
})

test("empty, missing or placeholder notes are refused", () => {
  const cases = [
    [notesText({ versionNotes: "" }), /"## Version notes" is empty/],
    [notesText({ rationale: "" }), /rationale/],
    [
      notesText({
        versionNotes:
          "- (draft) describe what changed since the last AMO release here",
      }),
      /placeholder/,
    ],
    [
      notesText({ reviewer: "TODO explain the page" }),
      /placeholder text "TODO"/,
    ],
    [
      notesText().replace("## Notes for reviewers", "## Reviewers"),
      /no "## Notes for reviewers"/,
    ],
    ["## Version notes\n\nx\n", /no <!-- amo-release/],
    [
      notesText({ versionNotes: "- Adds a page.\n\n## Fixed\n\n- A crash." }),
      /"## Fixed" is not a field/,
    ],
  ]
  for (const [text, expected] of cases) {
    const problems = notesProblems(parseNotes(text), ev)
    assert.ok(
      problems.some((p) => expected.test(p)),
      `${expected}: ${problems.join("; ")}`
    )
  }
})

test("the branch's notes win unless they are the baseline's own", () => {
  const baseline = { version: "1.2.3" }
  const branch = notesText({ version: "1.3.0", reviewer: "branch" })
  const tree = notesText({ version: "1.2.4", reviewer: "tree" })
  assert.equal(pickNotes(baseline, branch, tree), branch)
  // Malformed ones too, so the PR can say what is wrong with them.
  const malformed = notesText({ version: "v1.3.0" })
  assert.equal(pickNotes(baseline, malformed, tree), malformed)
  const headerless = "## Version notes\n\n- Edited by hand.\n"
  assert.equal(pickNotes(baseline, headerless, tree), headerless)
  // A branch left over from the last release names the baseline's version.
  const leftover = notesText({ version: "1.2.3", reviewer: "old" })
  assert.equal(pickNotes(baseline, leftover, tree), tree)
  assert.equal(pickNotes(baseline, undefined, tree), tree)
  assert.equal(pickNotes(baseline, undefined, undefined), undefined)
})

test("the generated reviewer block says what changed, from the manifests alone", () => {
  const candidate = {
    ...MANIFEST,
    permissions: ["storage", "tabs", "downloads"],
    description: "new",
  }
  const rows = surfaceRows(MANIFEST, candidate)
  const other = otherManifestChanges(MANIFEST, candidate)
  assert.deepEqual(other, ["description"])
  const block = generatedReviewerBlock({
    extRel: "extensions/x",
    baseline: ev.baseline,
    rows,
    other,
    delta: fileDelta(
      { "a.js": "1", "b.js": "1" },
      { "a.js": "2", "c.js": "1" }
    ),
  })
  assert.match(
    block,
    /Permissions: CHANGED from "storage, tabs" to "storage, tabs, downloads"/
  )
  assert.match(block, /Host permissions: unchanged \(\*:\/\/\*\/\*\)/)
  assert.match(
    block,
    /Content scripts: unchanged \(watch\.js at document_idle on \*:\/\/\*\/\*\)/
  )
  assert.match(block, /Data collection: unchanged/)
  assert.match(block, /Other manifest keys changed: description/)
  assert.match(block, /added c\.js; changed a\.js; removed b\.js/)
})

test("fields over AMO's limit are refused", () => {
  const notes = parseNotes(notesText({ reviewer: "x".repeat(MAX_FIELD) }))
  const payload = amoPayload(notes, "generated")
  assert.match(payloadProblems(payload)[0], /approval_notes is \d+ characters/)
})

test("the sign refuses a build or version the release PR did not review", () => {
  const record = {
    version: "1.3.0",
    files: { "manifest.json": "m", "worker.js": "w" },
    amo: {
      release_notes: "- Adds a page.",
      approval_notes: "The page is local.",
    },
  }
  const reviewed = { packageVersion: "1.3.0", distFiles: { ...record.files } }
  assert.deepEqual(signProblems(record, reviewed), [])
  assert.match(
    signProblems(record, {
      ...reviewed,
      distFiles: { ...record.files, "worker.js": "x" },
    })[0],
    /differ from release\.json: worker\.js/
  )
  assert.match(
    signProblems(record, {
      ...reviewed,
      distFiles: { ...record.files, "new.js": "n" },
    })[0],
    /new\.js/
  )
  assert.match(
    signProblems(record, { ...reviewed, packageVersion: "1.2.3" })[0],
    /package\.json is at 1\.2\.3/
  )
  assert.match(
    signProblems({ ...record, amo: null }, reviewed)[0],
    /no AMO payload/
  )
})

test("the changelog section goes under the title, once", () => {
  const raw = "# pkg\n\n## 1.2.3\n\n- old\n"
  const once = withChangelogSection(raw, "1.3.0", "- new")
  assert.equal(once, "# pkg\n\n## 1.3.0\n\n- new\n\n## 1.2.3\n\n- old\n")
  assert.equal(withChangelogSection(once, "1.3.0", "- new"), once)
})

// Notes written on main ahead of a release are checked here, on their own PR;
// the release job checks the digest and AMO's limits against the real build.
test("suspender-ledger's committed notes are usable", () => {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../suspender-ledger"
  )
  const record = JSON.parse(
    fs.readFileSync(path.join(root, "release/release.json"), "utf8")
  )
  const notes = parseNotes(
    fs.readFileSync(path.join(root, "release/notes.md"), "utf8")
  )
  if (notes.version === record.version) {
    assert.equal(record.amo?.release_notes, notes.releaseNotes)
    return
  }
  const problems = notesProblems(notes, {
    baseline: record,
    candidate: { content: notes.content },
  })
  assert.deepEqual(problems, [])
})

test("a merged release that is still being submitted opens no new PR", () => {
  const baseline = { version: "0.2.1" }
  const candidate = { content: "sha256:new" }
  const merged = { version: "0.3.0", content: "sha256:new" }
  assert.equal(awaitingSubmission(merged, { baseline, candidate }), true)
  // Main moved on since that release: there is something new to release.
  const other = { candidate: { content: "sha256:newer" }, baseline }
  assert.equal(awaitingSubmission(merged, other), false)
  // Main's record is the baseline itself: nothing is in flight.
  const released = { version: "0.2.1", content: "sha256:new" }
  assert.equal(awaitingSubmission(released, { baseline, candidate }), false)
  assert.equal(awaitingSubmission(undefined, { baseline, candidate }), false)
})
