#!/usr/bin/env node
// Writes the lines-of-code snapshot the header's widget shows
// (apps/www/src/lib/loc-report): the last 180 days of the person's commits,
// per day and per repository, read from git history.
//
// Run by `.github/actions/loc-snapshot` right before www is built for Pages,
// the Docker image or the APK, so the number is as fresh as the release that
// carries it and nothing is fetched at runtime. Locally it is optional: a
// checkout that never ran it ships the tracked placeholder, and the widget
// stays out of the header.
//
//   pnpm loc:snapshot                         this repository only
//   LOC_SERVER_DIR=../server pnpm loc:snapshot  and a clone of paulgsc/server
//   pnpm loc:snapshot --repo some-ui=. --repo server=../server --out /tmp/loc.json
//   pnpm loc:snapshot --through 2026-10-03    count back from another day
//
// Best-effort by design: a repository it cannot read is skipped with a
// warning, and the snapshot is still written from the rest, but the run then
// exits 1, so a build that asked for the server's history and could not use it
// shows a failed-but-continued step and not a quiet pass. With none left it
// writes nothing and exits 1, leaving the placeholder in place.
//
// A shallow clone is one it cannot read: git shows a shallow clone's oldest
// commit as adding every file it holds, which is how a one-week count came out
// at 431,758 lines. The action reads a full clone of its own, in a directory of
// its own, so the workspace is left as it was.
//
// It overwrites the tracked placeholder, so after a local run reset it with
// `git checkout apps/www/src/generated/loc-snapshot.json`; the www tests fail
// until you do, so real numbers are never committed by accident.
//
// Runs on Node's built-in type stripping, like the check:* scripts, and needs
// nothing installed: the Docker release job runs it before any `pnpm install`.
// The rules (who counts, which files do not) live in the www lib, where they
// are tested.
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { parseArgs } from "node:util"

import type { CommitStat } from "../apps/www/src/lib/loc-report/collect.ts"
import {
  assembleSnapshot,
  GIT_LOG_DATE,
  GIT_LOG_FORMAT,
  parseGitLog,
  WINDOW_DAYS,
} from "../apps/www/src/lib/loc-report/collect.ts"
// Loaded from source, not through the package, so nothing has to be installed.
import { addDays } from "../packages/core-utils/src/lib/date-utils.ts"

const root = resolve(import.meta.dirname, "..")

const { values } = parseArgs({
  options: {
    repo: { type: "string", multiple: true },
    out: { type: "string" },
    through: { type: "string" },
  },
})
const out =
  values.out ?? resolve(root, "apps/www/src/generated/loc-snapshot.json")
const through = values.through ?? new Date().toISOString().slice(0, 10)
// The first day of the window, once: what git is asked for and what is kept.
const from = addDays(through, -(WINDOW_DAYS - 1))

// `name=directory`. By default this repository, plus the server's when
// LOC_SERVER_DIR names a clone of it.
const requested = values.repo ?? [
  `some-ui=${root}`,
  ...(process.env.LOC_SERVER_DIR
    ? [`server=${process.env.LOC_SERVER_DIR}`]
    : []),
]

const warn = (message: string): void => {
  console.warn(process.env.GITHUB_ACTIONS ? `::warning::${message}` : message)
}

// UTC, so `%cd` names the same day wherever this runs.
const git = (cwd: string, ...args: Array<string>): string =>
  execFileSync("git", ["-c", "core.quotePath=false", ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, TZ: "UTC" },
  })

function commitsOf(directory: string): Array<CommitStat> {
  if (!existsSync(directory)) throw new Error(`${directory} does not exist`)
  if (
    git(directory, "rev-parse", "--is-shallow-repository").trim() === "true"
  ) {
    throw new Error(
      `${directory} is a shallow clone, whose oldest commit would count as adding everything; run git fetch --unshallow`
    )
  }
  return parseGitLog(
    git(
      directory,
      "log",
      "HEAD",
      "--no-merges",
      `--since=${from}T00:00:00Z`,
      "--numstat",
      `--date=${GIT_LOG_DATE}`,
      `--format=${GIT_LOG_FORMAT}`
    )
  )
}

const repos: Array<{ name: string; commits: Array<CommitStat> }> = []
const skipped: Array<string> = []
for (const spec of requested) {
  const [name, ...rest] = spec.split("=")
  const directory = resolve(rest.join("="))
  try {
    repos.push({ name, commits: commitsOf(directory) })
  } catch (error) {
    skipped.push(name)
    warn(
      `loc-snapshot: skipping ${name}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

if (repos.length === 0) {
  warn(
    "loc-snapshot: no repository could be read; leaving the snapshot as it was"
  )
  process.exitCode = 1
} else {
  const snapshot = assembleSnapshot({
    from,
    through,
    generatedAt: new Date().toISOString(),
    repos,
  })
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`)
  console.log(
    `loc-snapshot: ${repos.map((repo) => repo.name).join(", ")} through ${through}, ${snapshot.days.length} active days -> ${out}`
  )
  if (skipped.length > 0) {
    warn(
      `loc-snapshot: wrote the snapshot without ${skipped.join(", ")}; see the warnings above`
    )
    process.exitCode = 1
  }
}
