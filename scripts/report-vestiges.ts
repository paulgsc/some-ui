#!/usr/bin/env node
// Report: vestige candidates (CLAUDE.md, "Vestiges"). Ranks every
// non-deployable workspace by three mechanical signals: no deployable reaches
// it, its own source has not changed in STALE_DAYS (sweeps excluded), and it
// lacks the scripts or tests live workspaces carry. The rule lives in
// packages/eslint/src/vestiges.ts.
//
// Report-only: it always exits 0. A high score is a question for the owner
// ("is this story dead?"), not a verdict, so it is not wired into CI. Needs
// full history (`git fetch --unshallow`): in a shallow clone, every workspace
// looks as old as the clone's first commit.
//
// Runs on Node's built-in type stripping, like the check:* scripts.
//   pnpm report:vestiges            candidates: unreached, or stale and drifting
//   pnpm report:vestiges --all      every non-deployable workspace, scored
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"

import type {
  CommitFacts,
  WorkspaceFacts,
} from "../packages/eslint/src/vestiges.ts"
import { assessVestiges } from "../packages/eslint/src/vestiges.ts"

const git = (...args: Array<string>): string =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  })

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim()

// Mirrors pnpm-workspace.yaml's globs closely enough for this repo's layout.
const WORKSPACE =
  /^(apps|extensions|crates|packages\/ui|packages)\/[^/]+\/package\.json$|^docs\/canon\/package\.json$/
const tracked = git("ls-files", "-z").split("\0").filter(Boolean)
const TEST = /\.(test|spec)\.[cm]?[jt]sx?$|\/(__tests__|tests?)\//

/**
 * An extension that ships: a `public/` file named like a manifest that is a
 * browser-extension manifest (some ship only `manifest.firefox.json`). Same
 * test as the résumé's extension count in check-claims.mjs.
 */
const shipsManifest = (dir: string): boolean =>
  dir.startsWith("extensions/") &&
  tracked.some(
    (file) =>
      file.startsWith(`${dir}/public/`) &&
      /manifest[^/]*\.json$/.test(file) &&
      readFileSync(join(root, file), "utf8").includes('"manifest_version"')
  )

type Manifest = {
  name?: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

const workspaces: Array<WorkspaceFacts> = tracked
  .filter((path) => WORKSPACE.test(path))
  .map((path) => {
    const dir = dirname(path)
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a package.json's shape, read for four fields
    const manifest = JSON.parse(
      readFileSync(join(root, path), "utf8")
    ) as Manifest
    const files = tracked.filter(
      (file) => file.startsWith(`${dir}/`) && /\.(tsx?|jsx?|mts)$/.test(file)
    )
    return {
      dir,
      name: manifest.name ?? dir,
      deps: Object.keys({
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.peerDependencies,
      }),
      scripts: Object.keys(manifest.scripts ?? {}),
      sourceFiles: files.filter((file) => !TEST.test(file)).length,
      testFiles: files.filter((file) => TEST.test(file)).length,
      // Apps, shipped extensions and document builds are what users get.
      deployable:
        dir.startsWith("apps/") ||
        dir.startsWith("docs/") ||
        shipsManifest(dir),
    }
  })

// Deleting a file is cleanup, not work on the story, so a commit's files are
// the ones it added, changed or renamed into (its destination path).
const commits: Array<CommitFacts> = git(
  "log",
  "--no-merges",
  "--format=@@%ad",
  "--date=short",
  "--name-status"
)
  .split("@@")
  .slice(1)
  .map((block) => {
    const [date = "", ...lines] = block.trim().split("\n")
    const files = lines
      .map((line) => line.split("\t"))
      .filter(([status = ""]) => status !== "" && !status.startsWith("D"))
      .map((fields) => fields.at(-1) ?? "")
    return { date, files }
  })

const today = new Date().toISOString().slice(0, 10)
const all = process.argv.includes("--all")
const reports = assessVestiges(workspaces, commits, today).filter(
  (report) => all || report.candidate
)

if (git("rev-parse", "--is-shallow-repository").trim() === "true") {
  // eslint-disable-next-line no-console
  console.warn(
    "[vestiges] shallow clone: own-change dates are clipped; run `git fetch --unshallow` first"
  )
}
for (const r of reports) {
  const age =
    r.daysSinceOwnChange === null
      ? "never"
      : `${r.daysSinceOwnChange}d${r.sweepOnly ? " (sweeps only)" : ""}`
  const flags = [r.reached ? "" : "unreached", ...r.drift].filter(Boolean)
  // eslint-disable-next-line no-console
  console.log(
    `${String(r.score).padStart(2)}  ${r.dir.padEnd(38)} own change ${age.padEnd(18)} ${String(r.dependents).padStart(2)} dependents  ${flags.join(", ")}`
  )
}
// eslint-disable-next-line no-console
console.log(
  `[vestiges] ${reports.length} candidate(s). Higher is likelier dead; see CLAUDE.md "Vestiges".`
)
