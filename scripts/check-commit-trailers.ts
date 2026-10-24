#!/usr/bin/env node
// Guardrail: the change-kind record (CLAUDE.md, "Two kinds of pull request").
// The rule lives in packages/eslint/src/commit-trailers.ts.
//
//   node scripts/check-commit-trailers.ts --message-file <path>
//     The commit-msg hook (.husky/commit-msg): the message being written.
//   node scripts/check-commit-trailers.ts <base>..<head>
//     pr.yml: every non-merge commit a pull request adds. Commits a bot
//     wrote (a `name[bot]` author or committer) are exempt.
//   node scripts/check-commit-trailers.ts
//     The same over origin/main..HEAD, for a branch before it is pushed.
//
// Runs on Node's built-in type stripping, with no install (see
// scripts/check-test-layout.ts).
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

import {
  checkCommitTrailers,
  cleanCommitMessage,
  describeTrailerFinding,
  isBotIdentity,
} from "../packages/eslint/src/commit-trailers.ts"

type Commit = { label: string; message: string }

function commitsIn(range: string): Array<Commit> {
  // NUL between fields and RS between commits: neither occurs in a message.
  const out = execFileSync(
    "git",
    [
      "log",
      "--no-merges",
      "--format=%H%x00%an%x00%ae%x00%cn%x00%ce%x00%B%x1e",
      range,
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  )
  const commits: Array<Commit> = []
  for (const record of out.split("\x1e")) {
    const [hash = "", an = "", ae = "", cn = "", ce = "", body = ""] = record
      .replace(/^\n/, "")
      .split("\0")
    if (hash === "") continue
    if (isBotIdentity(an, ae) || isBotIdentity(cn, ce)) continue
    const subject = body.trim().split("\n", 1)[0] ?? ""
    commits.push({ label: `${hash.slice(0, 10)} ${subject}`, message: body })
  }
  return commits
}

const args = process.argv.slice(2)
let commits: Array<Commit>
if (args[0] === "--message-file" && args[1]) {
  const message = cleanCommitMessage(readFileSync(args[1], "utf8"))
  commits = [{ label: "this commit", message }]
} else {
  commits = commitsIn(args[0] ?? "origin/main..HEAD")
}

let failed = 0
for (const commit of commits) {
  const findings = checkCommitTrailers(commit.message)
  if (findings.length === 0) continue
  failed += 1
  for (const finding of findings) {
    // eslint-disable-next-line no-console
    console.error(
      `[commit-trailers] ${commit.label}: ${describeTrailerFinding(finding)}`
    )
  }
}

if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error(
    `[commit-trailers] ${failed} commit(s) to fix. See CLAUDE.md "Two kinds of pull request".`
  )
  process.exitCode = 1
} else {
  // eslint-disable-next-line no-console
  console.log(`[commit-trailers] ok (${commits.length} checked)`)
}
