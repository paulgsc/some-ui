// Vestige candidates: workspaces nothing live points to, or whose own code has
// stopped moving while the repo's conventions moved on (CLAUDE.md,
// "Vestiges"). A report, not a gate: whether a story is dead is the owner's
// call, and a deployable's own entry points (an extension's manifest, a
// registry key, a CLI script) are only partly visible from package.json. The
// three signals are each mechanical:
//
// - reach: no deployable (an app, or an extension that ships a manifest)
//   depends on the workspace, directly or through another workspace;
// - staleness: days since a commit last changed the workspace's own source,
//   not counting tests, manifests and config, and not counting sweeps that
//   touched many workspaces at once (version bumps, renames, lint rollouts);
// - drift: missing the scripts every live workspace carries (lint, typecheck,
//   test, knip), or no tests at all.
//
// `scripts/report-vestiges.ts` feeds this from `git log` and the manifests.
// Pure on purpose, so its tests pin the rule without a repository.

export type WorkspaceFacts = {
  /** Repo-relative directory, e.g. `packages/ui/topik`. */
  readonly dir: string
  readonly name: string
  /** Names of every package it depends on, of any dependency kind. */
  readonly deps: ReadonlyArray<string>
  readonly scripts: ReadonlyArray<string>
  /** JS/TS source files, tests excluded. Drift is only judged where > 0. */
  readonly sourceFiles: number
  readonly testFiles: number
  /** An app, or an extension that ships a manifest: something users run. */
  readonly deployable: boolean
}

export type CommitFacts = {
  /** `YYYY-MM-DD`. */
  readonly date: string
  readonly files: ReadonlyArray<string>
}

export type VestigeReport = {
  readonly dir: string
  readonly name: string
  readonly reached: boolean
  /** Date of the last own change, or null when none is in history. */
  readonly lastOwnChange: string | null
  readonly daysSinceOwnChange: number | null
  /** The last own change came only from sweeps (see SWEEP_WORKSPACES). */
  readonly sweepOnly: boolean
  /** How many workspaces depend on this one. */
  readonly dependents: number
  readonly drift: ReadonlyArray<string>
  /**
   * Unreached, or stale and drifting and not a shared library (at most
   * SHARED_LIBRARY dependents): what the rule calls a candidate.
   */
  readonly candidate: boolean
  readonly score: number
}

/**
 * A commit touching more workspaces' source than this is a sweep (a version
 * bump, a rename, a lint rollout). Feature work here routinely spans four to
 * eight workspaces, so the bar sits above that.
 */
export const SWEEP_WORKSPACES = 8
/**
 * More dependents than this make a workspace a shared library, which is
 * expected to sit still; the repo's shared libraries have seven to twenty.
 */
export const SHARED_LIBRARY = 2
/** Own code untouched for longer than this counts as stale. */
export const STALE_DAYS = 60

// Manifests, docs and config are upkeep, not work on the story: any
// `*.config.*` (vite, vitest, eslint, uno, playwright, capacitor, ...) and
// `*.setup.*`, tsconfigs, and the files every workspace carries.
const NOT_OWN_WORK =
  /(^|\/)(package\.json|CHANGELOG\.md|README\.md|tsconfig[^/]*\.json|knip\.json|[^/]+\.(config|setup)\.[cm]?[jt]sx?)$|\.(test|spec|stories)\.[cm]?[jt]sx?$|\/(__tests__|tests?)\//

const REQUIRED_SCRIPTS: ReadonlyArray<ReadonlyArray<string>> = [
  ["lint", "lint:js"],
  ["typecheck"],
  ["test"],
  ["knip"],
]

/** Directories reachable from a deployable over dependency names. */
export function reachableDirs(
  workspaces: ReadonlyArray<WorkspaceFacts>
): Set<string> {
  const byName = new Map(workspaces.map((w) => [w.name, w]))
  const reached = new Set<string>()
  const queue = workspaces.filter((w) => w.deployable)
  for (let next = queue.pop(); next; next = queue.pop()) {
    if (reached.has(next.dir)) continue
    reached.add(next.dir)
    for (const dep of next.deps) {
      const target = byName.get(dep)
      if (target && !reached.has(target.dir)) queue.push(target)
    }
  }
  return reached
}

/**
 * The workspace a path belongs to, read from the path itself (the
 * pnpm-workspace.yaml globs), not from today's workspace list: a sweep that
 * touched workspaces since deleted still counts them (review, #1648).
 */
const WORKSPACE_ROOT =
  /^(packages\/ui\/[^/]+|apps\/[^/]+|extensions\/[^/]+|crates\/[^/]+|docs\/canon|packages\/[^/]+)\//

export function workspaceRootOf(path: string): string | undefined {
  return WORKSPACE_ROOT.exec(path)?.[1]
}

/** Last commit that changed `dir`'s own source; `commits` newest first. */
export function lastOwnChange(
  dir: string,
  commits: ReadonlyArray<CommitFacts>
): { date: string | null; sweepOnly: boolean } {
  let sweep: string | null = null
  for (const commit of commits) {
    const own = commit.files.filter(
      (file) => file.startsWith(`${dir}/`) && !NOT_OWN_WORK.test(file)
    )
    if (own.length === 0) continue
    const touched = new Set(
      commit.files
        .filter((file) => !NOT_OWN_WORK.test(file))
        .map(workspaceRootOf)
        .filter((found) => found !== undefined)
    )
    if (touched.size <= SWEEP_WORKSPACES) {
      return { date: commit.date, sweepOnly: false }
    }
    sweep ??= commit.date
  }
  return { date: sweep, sweepOnly: sweep !== null }
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)
}

/** Every non-deployable workspace with its signals, highest score first. */
export function assessVestiges(
  workspaces: ReadonlyArray<WorkspaceFacts>,
  commits: ReadonlyArray<CommitFacts>,
  today: string
): Array<VestigeReport> {
  const reached = reachableDirs(workspaces)
  const dependents = new Map<string, number>()
  for (const w of workspaces) {
    for (const dep of new Set(w.deps)) {
      dependents.set(dep, (dependents.get(dep) ?? 0) + 1)
    }
  }
  return workspaces
    .filter((w) => !w.deployable)
    .map((w): VestigeReport => {
      const last = lastOwnChange(w.dir, commits)
      const days = last.date === null ? null : daysBetween(last.date, today)
      // Only code is held to code's conventions: a Rust crate, a docs build
      // or a config-only package has no JS source to lint, test or knip.
      const drift =
        w.sourceFiles === 0
          ? []
          : REQUIRED_SCRIPTS.filter(
              (names) => !names.some((name) => w.scripts.includes(name))
            ).map((names) => `no ${names.join("/")} script`)
      if (w.sourceFiles > 0 && w.testFiles === 0) drift.push("no tests")
      const isReached = reached.has(w.dir)
      const stale = days === null || days > STALE_DAYS || last.sweepOnly
      const drifting = drift.length > 0
      const fanIn = dependents.get(w.name) ?? 0
      // Drift alone is debt in a live workspace, not a sign it is dead; it
      // counts once, and only marks a candidate alongside staleness.
      const score = (isReached ? 0 : 3) + (stale ? 2 : 0) + (drifting ? 1 : 0)
      return {
        dir: w.dir,
        name: w.name,
        reached: isReached,
        lastOwnChange: last.date,
        daysSinceOwnChange: days,
        sweepOnly: last.sweepOnly,
        dependents: fanIn,
        drift,
        candidate: !isReached || (stale && drifting && fanIn <= SHARED_LIBRARY),
        score,
      }
    })
    .sort((a, b) => b.score - a.score || a.dir.localeCompare(b.dir))
}
