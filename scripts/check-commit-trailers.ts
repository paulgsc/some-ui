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

import { CALLS_FILE, readCalls } from "../packages/eslint/src/calls.ts"
import {
  callIdsOf,
  checkCommitTrailers,
  cleanCommitMessage,
  describeTrailerFinding,
  isBotIdentity,
} from "../packages/eslint/src/commit-trailers.ts"

// `hash` is null for the message being written, whose record is the tree's.
type Commit = { label: string; message: string; hash: string | null }

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
    commits.push({
      label: `${hash.slice(0, 10)} ${subject}`,
      message: body,
      hash,
    })
  }
  return commits
}

const args = process.argv.slice(2)
let commits: Array<Commit>
if (args[0] === "--message-file" && args[1]) {
  const message = cleanCommitMessage(readFileSync(args[1], "utf8"))
  commits = [{ label: "this commit", message, hash: null }]
} else {
  commits = commitsIn(args[0] ?? "origin/main..HEAD")
}

/** The call ids docs/calls.json holds at `hash`, or in the tree for null. */
function recordedCalls(hash: string | null): Set<string> {
  let text: string
  try {
    text =
      hash === null
        ? readFileSync(CALLS_FILE, "utf8")
        : execFileSync("git", ["show", `${hash}:${CALLS_FILE}`], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
          })
  } catch {
    return new Set()
  }
  return new Set((readCalls(text).calls ?? []).map((call) => call.id))
}

let failed = 0
for (const commit of commits) {
  const lines = checkCommitTrailers(commit.message).map(describeTrailerFinding)
  const ids = callIdsOf(commit.message)
  if (ids.length > 0) {
    const known = recordedCalls(commit.hash)
    for (const id of ids.filter((i) => !known.has(i)))
      lines.push(
        `Call: ${id} is not in ${CALLS_FILE} at this commit. Record the call there in the same commit.`
      )
  }
  if (lines.length === 0) continue
  failed += 1
  for (const line of lines) {
    // eslint-disable-next-line no-console
    console.error(`[commit-trailers] ${commit.label}: ${line}`)
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
