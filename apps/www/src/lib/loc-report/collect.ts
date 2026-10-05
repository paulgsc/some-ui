/**
 * Turning `git log --numstat` into a snapshot, as pure functions over text.
 * `scripts/loc-snapshot.ts` runs git and writes the file. Never bundled.
 *
 * - **Humans only**: an author ending in `[bot]` is skipped.
 * - **Generated files are counted apart** (`genAdd`/`genDel`): one lockfile
 *   bump can outweigh a month of work, so the default view leaves them out.
 * - **Each commit's own diff**: merge commits have none, and the commits they
 *   bring in count themselves.
 * - **By the day a commit landed**, in UTC.
 */

import type { LocSnapshot, RepoDay } from "./schema.ts"

/**
 * Days of history a snapshot carries: the widget's longest range (90) and
 * the 90 days before it, for "vs previous period".
 *
 * No runtime imports: the Docker release job runs the generator with bare
 * Node. The script does the calendar arithmetic (`@some-ui/core-utils`'
 * `date-utils.ts` from source), and the shape is checked by this module's
 * test instead of `zod`.
 */
export const WINDOW_DAYS = 180

type FileStat = { path: string; added: number; removed: number }

export type CommitStat = {
  /** `YYYY-MM-DD`, UTC. */
  date: string
  author: string
  files: ReadonlyArray<FileStat>
}

/**
 * The log format `parseGitLog` reads: a record separator, the committer date,
 * a unit separator and the author name, then git's own `--numstat` lines.
 * Passed to `git log` as `--format`; kept here so the two cannot drift.
 */
export const GIT_LOG_FORMAT = "%x1e%cd%x1f%an"
export const GIT_LOG_DATE = "format-local:%Y-%m-%d"

const RECORD = "\u001e"
const FIELD = "\u001f"
const NUMSTAT_LINE = /^(\d+|-)\t(\d+|-)\t(.+)$/

/**
 * `git log` prints a rename as `old => new`, or `dir/{old => new}/file`; the
 * classifier wants the path the file has now.
 */
export function expandRenamedPath(path: string): string {
  const braced = /^(.*)\{(.*) => (.*)\}(.*)$/.exec(path)
  if (braced !== null) {
    return `${braced[1]}${braced[3]}${braced[4]}`.replaceAll(/\/{2,}/g, "/")
  }
  const parts = path.split(" => ")
  return parts.length === 2 ? parts[1] : path
}

export function parseGitLog(raw: string): Array<CommitStat> {
  const commits: Array<CommitStat> = []
  for (const record of raw.split(RECORD)) {
    if (record.trim() === "") continue
    const [header = "", ...lines] = record.split("\n")
    const [date = "", author = ""] = header.split(FIELD)
    const files: Array<FileStat> = []
    for (const line of lines) {
      const match = NUMSTAT_LINE.exec(line)
      if (match === null) continue
      // A binary file reports `-` for both counts; it has no lines to count.
      files.push({
        path: expandRenamedPath(match[3]),
        added: match[1] === "-" ? 0 : Number(match[1]),
        removed: match[2] === "-" ? 0 : Number(match[2]),
      })
    }
    commits.push({ date, author, files })
  }
  return commits
}

export function isBot(author: string): boolean {
  return /\[bot\]$/i.test(author)
}

/**
 * Files nobody wrote by hand, across both repositories:
 *
 * - lockfiles;
 * - anything under a `generated/` directory or named `*.gen.*`
 *   (`routeTree.gen.ts`, `packages/server-routes/src/generated/routes.ts`);
 * - the route snapshot `routes.server.json`;
 * - `.sqlx/`, the server's offline query cache, and the server's
 *   `.github/docker-changesets/`;
 * - test snapshots, changelogs and built output.
 */
const GENERATED: ReadonlyArray<RegExp> = [
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|Cargo\.lock|bun\.lockb?)$/,
  /(^|\/)generated\//,
  /\.gen\.[cm]?[jt]sx?$/,
  /(^|\/)routes\.server\.json$/,
  /(^|\/)\.sqlx\//,
  /^\.github\/docker-changesets\//,
  /(^|\/)__snapshots__\//,
  /\.snap$/,
  /(^|\/)CHANGELOG\.md$/,
  /(^|\/)dist\//,
  /\.min\.(js|css)$/,
]

export function isGeneratedPath(path: string): boolean {
  return GENERATED.some((pattern) => pattern.test(path))
}

const NO_LINES: RepoDay = { add: 0, del: 0, genAdd: 0, genDel: 0 }

/**
 * One repository's lines per day, from `from` through `through`. Bounded here
 * too, so a commit with a skewed clock does not reach the file.
 */
export function foldCommits(
  commits: ReadonlyArray<CommitStat>,
  from: string,
  through: string
): Map<string, RepoDay> {
  const days = new Map<string, RepoDay>()
  for (const commit of commits) {
    if (isBot(commit.author)) continue
    if (commit.date < from || commit.date > through) continue
    const day = days.get(commit.date) ?? { ...NO_LINES }
    for (const file of commit.files) {
      if (isGeneratedPath(file.path)) {
        day.genAdd += file.added
        day.genDel += file.removed
      } else {
        day.add += file.added
        day.del += file.removed
      }
    }
    days.set(commit.date, day)
  }
  return days
}

type RepoCommits = { name: string; commits: ReadonlyArray<CommitStat> }

export function assembleSnapshot({
  from,
  through,
  generatedAt,
  repos,
}: {
  /** First day of the window: `WINDOW_DAYS - 1` days before `through`. */
  from: string
  through: string
  generatedAt: string
  repos: ReadonlyArray<RepoCommits>
}): LocSnapshot {
  const byDate = new Map<string, Record<string, RepoDay>>()
  for (const repo of repos) {
    for (const [date, day] of foldCommits(repo.commits, from, through)) {
      byDate.set(date, { ...byDate.get(date), [repo.name]: day })
    }
  }
  const days = [...byDate]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, perRepo]) => ({ date, repos: perRepo }))
  return {
    version: 1,
    generatedAt,
    through,
    repos: repos.map((repo) => repo.name),
    days,
  }
}
