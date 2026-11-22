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
//   pnpm report:vestiges --usage <friction.json>
//                                   also the usage candidates (#3338): each
//                                   module the aggregate (some-ui.friction/3,
//                                   which `motion walkthrough --home` keeps
//                                   beside its render) shows nobody opening, by
//                                   the silence rule in
//                                   packages/engagement/src/lib/silence.ts.
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"

import {
  MODULE_OPENS_SCHEMA,
  readModuleOpens,
  SILENT_WEEKS,
  silentModules,
} from "../packages/engagement/src/lib/silence.ts"
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
  `[vestiges] ${reports.filter((r) => r.candidate).length} candidate(s)${all ? ` of ${reports.length} workspaces listed` : ""}. Higher is likelier dead; see CLAUDE.md "Vestiges".`
)

/**
 * The usage candidates (#3338): modules the build offers that home's
 * aggregate shows nobody opening. Read from `--usage`, never fetched: a
 * report, never a gate, like the code candidates above.
 */
const usageAt = process.argv.indexOf("--usage")
const usageFile = usageAt === -1 ? undefined : process.argv[usageAt + 1]
if (usageFile === undefined) {
  // eslint-disable-next-line no-console
  console.log(
    "[vestiges] usage candidates: none read; pass --usage <a walkthrough's friction.json> to list the modules nobody opens."
  )
} else {
  const usage: unknown = JSON.parse(readFileSync(usageFile, "utf8"))
  const read = readModuleOpens(usage)
  if (!read.ok)
    throw new Error(
      read.at === -1
        ? `${usageFile}: not a ${MODULE_OPENS_SCHEMA} aggregate`
        : `${usageFile}: module ${String(read.at)} isn't one module's opens`
    )
  const { modules } = read
  const silent = silentModules(modules)
  // eslint-disable-next-line no-console
  for (const s of silent)
    console.log(
      `silent  ${s.pipeline.padEnd(38)} ${s.weeksQuiet === null ? "never opened" : `not opened in ${String(s.weeksQuiet)} weeks`}`
    )
  const unmeasured = modules.filter(
    (m) => m.opened.kind === "not-measured"
  ).length
  // eslint-disable-next-line no-console
  console.log(
    `[vestiges] ${String(silent.length)} usage candidate(s): quiet ${String(SILENT_WEEKS)} weeks or more; ${String(unmeasured)} module(s) not measured, so never called silent.`
  )
}
