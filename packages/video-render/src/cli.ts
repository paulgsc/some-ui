/**
 * The renderer from a shell, in a session or on home:
 *
 *   pnpm --filter @some-ui/video-render render <video folder> --series <series folder>
 *       [--out outputs/video.mp4] [--without-burn-ins]
 *
 * reads `<video folder>/cut-list.json` and writes the video and
 * `shot-times.json` beside it.
 *
 *   pnpm --filter @some-ui/video-render render from-timeline <short folder> --series <series folder>
 *
 * reads a v1 short (`timeline.json`, the recorder's `marks.json` beside each
 * capture, and `voice/takes.json` when the timeline names it) and writes
 * `<short folder>/cut-list.json`.
 *
 *   pnpm --filter @some-ui/video-render render call-facts --from <YYYY-MM-DD> --to <YYYY-MM-DD>
 *
 * prints the weekly call's facts for those days (`call-facts.ts`) as JSON,
 * read from GitHub's search API through the `gh` command.
 *
 *   pnpm --filter @some-ui/video-render render call-check <call folder>
 *
 * checks a `call/` folder before it is published (`callFolderProblems`):
 * its index, every week it lists against the call's schema, and no week
 * file it forgets; it prints every reason it can't be published.
 *
 *   pnpm --filter @some-ui/video-render render clip-check <clips folder>
 *
 * checks paulgsc/testing's `clips/` folder before it is pushed
 * (`clipFolderProblems`, SFEED7).
 *
 *   pnpm --filter @some-ui/video-render render compare-hearings <home transcript> <session words>
 *
 * lines up two hearings of one take (ST25, `hearings.ts`) and prints the
 * comparison as JSON: home's transcript as the Jobs mailbox holds it
 * (`transcript-<note>-<n>.json`), and the session's words (`WordsSchema`).
 *
 * `pnpm --filter` runs this from the package; INIT_CWD is where it was typed.
 */

import { execFile } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { access, readdir, writeFile } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { parseArgs, promisify } from "node:util"
import { z } from "zod"

import { ASK_LABEL, readAskIssue } from "./ask"
import { callFolderProblems } from "./call"
import { callsOf, changeOf, trailersOf, whereWeAreOf } from "./call-facts"
import type { CallFacts } from "./call-facts"
import { clipFolderProblems, parseClipIndex } from "./clip"
import { problemsOf } from "./cut-list"
import { compareHearings } from "./hearings"
import {
  fail,
  here,
  nodePorts,
  readJson,
  readSeries,
  Refused,
  renderFolder,
  runCommand,
} from "./node"
import { REPOS } from "./refs"
import { fromTimelineV1 } from "./timeline-v1"

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      series: { type: "string" },
      out: { type: "string", default: "outputs/video.mp4" },
      "without-burn-ins": { type: "boolean", default: false },
      from: { type: "string" },
      to: { type: "string" },
    },
  })
  const [first, second, third] = positionals
  if (first === "compare-hearings") {
    if (!second || !third) {
      fail(["usage: render compare-hearings <home transcript> <session words>"])
    }
    const home = await readAs(HeardSchema, here(second))
    const session = await readAs(HeardSchema, here(third))
    process.stdout.write(
      `${JSON.stringify(compareHearings(home, session), null, 1)}\n`
    )
    return
  }
  if (first === "call-facts") {
    if (!values.from || !values.to)
      fail(["usage: render call-facts --from <YYYY-MM-DD> --to <YYYY-MM-DD>"])
    const facts = await callFacts(values.from, values.to)
    process.stdout.write(`${JSON.stringify(facts, null, 1)}\n`)
    return
  }
  if (first === "call-check") {
    if (!second) fail(["usage: render call-check <call folder>"])
    const dir = here(second)
    const names = (await readdir(dir)).filter((n) => n.endsWith(".json"))
    const files = new Map<string, unknown>()
    for (const name of names) files.set(name, await readJson(join(dir, name)))
    const problems = callFolderProblems(files)
    if (problems.length > 0)
      fail([`${second} can't be published:`, ...problems])
    const weeks = names.length - 1
    process.stdout.write(
      `${second}: ${weeks} ${weeks === 1 ? "week" : "weeks"}, ready
`
    )
    return
  }
  if (first === "clip-check") {
    if (!second) fail(["usage: render clip-check <clips folder>"])
    const dir = here(second)
    const read = (path: string): unknown => {
      try {
        return JSON.parse(readFileSync(join(dir, path), "utf8"))
      } catch {
        return undefined
      }
    }
    const problems = clipFolderProblems(read, (path) =>
      existsSync(join(dir, path))
    )
    if (problems.length > 0)
      fail([`${second} can't be published:`, ...problems])
    const index = parseClipIndex(read("index.json"))
    const n = index.ok ? index.value.clips.length : 0
    process.stdout.write(
      `${second}: ${n} ${n === 1 ? "clip" : "clips"}, ready\n`
    )
    return
  }
  const converting = first === "from-timeline"
  const folder = converting ? second : first
  if (!folder || !values.series) {
    fail(["usage: render [from-timeline] <folder> --series <series folder>"])
  }
  const root = here(folder)
  if (converting) {
    const series = await readSeries(here(values.series))
    if (!series.ok) fail(series.problems)
    await convert(root, series.value)
    return
  }
  const done = await renderFolder(root, here(values.series), {
    workDir: "outputs/cache",
    out: values.out,
    withoutBurnIns: values["without-burn-ins"],
  })
  if (!done.ok) fail(["Nothing was rendered:", ...done.problems])
  const { video, shotTimesFile, leftOut } = done.value
  process.stdout.write(
    `wrote ${join(root, video)} and ${join(root, shotTimesFile)}\n`
  )
  for (const b of leftOut) {
    process.stdout.write(`left out: the ${b.kind} burn-in (${b.design})\n`)
  }
}

/** The parts of a v1 short's side files the converter reads. */
const SidesSchema = z.object({
  takes: z.string().nullish(),
  shots: z.array(z.object({ source: z.string().optional() })),
})
const MarksSchema = z.object({
  marks: z.array(z.object({ mark: z.string(), t: z.number() })),
})
const TakesSchema = z.object({
  cuts: z.array(
    z.object({ id: z.string(), take: z.object({ file: z.string() }).nullish() })
  ),
})

/** A hearing's words: a list, or an object holding one as `words`. */
const WordsSchema = z.array(
  z.object({
    text: z.string(),
    startMs: z.number().nonnegative(),
    endMs: z.number().nonnegative(),
    p: z.number().min(0).max(1).optional(),
  })
)
const HeardSchema = z.union([
  WordsSchema,
  z.object({ words: WordsSchema }).transform(({ words }) => words),
])

async function readAs<T>(schema: z.ZodType<T>, file: string): Promise<T> {
  const parsed = schema.safeParse(await readJson(file))
  if (!parsed.success)
    fail([`${file} can't be read:`, ...problemsOf(parsed.error, file)])
  return parsed.data
}

/** The recorder's marks beside a capture; a capture recorded with none has none. */
async function marksFor(file: string): Promise<ReadonlyMap<string, number>> {
  try {
    await access(file)
  } catch {
    // Ignored: no marks.json means no marks; any mark the timeline names
    // is then reported missing by `fromTimelineV1`.
    return new Map()
  }
  const { marks } = await readAs(MarksSchema, file)
  return new Map(marks.map((m) => [m.mark, m.t]))
}

/** A v1 short's timeline, marks and takes, to `cut-list.json`. */
async function convert(
  root: string,
  series: { id: string; version: number }
): Promise<void> {
  const timeline = await readJson(join(root, "timeline.json"))
  const sides = SidesSchema.safeParse(timeline)
  if (!sides.success) {
    fail([
      "The timeline can't be read:",
      ...problemsOf(sides.error, "timeline"),
    ])
  }
  const ports = nodePorts(root)
  const marks = new Map<string, ReadonlyMap<string, number>>()
  for (const { source } of sides.data.shots) {
    if (source && !marks.has(source)) {
      marks.set(
        source,
        await marksFor(join(root, dirname(source), "marks.json"))
      )
    }
  }
  const takes = new Map<string, { file: string; lengthMs: number }>()
  const takesPath = sides.data.takes
  if (takesPath) {
    const { cuts } = await readAs(TakesSchema, join(root, takesPath))
    for (const c of cuts) {
      if (!c.take) continue
      const path = relative(root, join(root, dirname(takesPath), c.take.file))
      const facts = await ports.probe(path)
      if (!facts) fail([`The take ${path} can't be read.`])
      takes.set(c.id, { file: path, lengthMs: facts.durationMs })
    }
  }
  const cutList = fromTimelineV1(timeline, { marks, takes, series })
  if (!cutList.ok) fail(["The timeline can't be read:", ...cutList.problems])
  const out = join(root, "cut-list.json")
  await writeFile(out, `${JSON.stringify(cutList.value, null, 1)}\n`)
  process.stdout.write(`wrote ${out}\n`)
}

const run = promisify(execFile)

/** GitHub's search answers at most this many results to one query. */
const SEARCH_MOST = 1000

const ghArgs = (
  endpoint: string,
  q: string,
  more: Array<string>
): Array<string> => ["api", "-X", "GET", endpoint, "-f", `q=${q}`, ...more]

/**
 * Every result of a GitHub search, as `schema` reads each `jq` line, or a
 * refusal naming the query: GitHub's own failure, a result set it cut short
 * or capped, or a result that isn't what the query asks for.
 */
async function search<T>(
  endpoint: "search/issues" | "search/commits",
  q: string,
  jq: string,
  schema: z.ZodType<T>
): Promise<Array<T>> {
  try {
    const head = await run(
      "gh",
      ghArgs(endpoint, q, [
        "-f",
        "per_page=1",
        "--jq",
        "[.total_count, .incomplete_results]",
      ])
    )
    const [total, incomplete] = z
      .tuple([z.number(), z.boolean()])
      .parse(JSON.parse(head.stdout))
    if (incomplete || total > SEARCH_MOST)
      fail([
        `GitHub's search for "${q}" gave ${incomplete ? "an incomplete answer" : `${total} results, past its ${SEARCH_MOST}`}: narrow the days and run it again.`,
      ])
    const { stdout } = await run(
      "gh",
      ghArgs(endpoint, q, ["-f", "per_page=100", "--paginate", "--jq", jq]),
      { maxBuffer: 64 * 1024 * 1024 }
    )
    return stdout
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => schema.parse(JSON.parse(line)))
  } catch (e) {
    if (e instanceof Refused) throw e
    return fail([`GitHub's search for "${q}" failed:`, String(e)])
  }
}

const PullHit = z.object({
  number: z.number(),
  title: z.string(),
  author: z.string(),
  mergedAt: z.string(),
  body: z.string(),
})
const CommitHit = z.object({ sha: z.string(), message: z.string() })
const IssueHit = z.object({
  number: z.number(),
  title: z.string(),
  createdAt: z.string(),
  body: z.string(),
})

/** The weekly call's facts for `from`..`to`, both days included. */
async function callFacts(from: string, to: string): Promise<CallFacts> {
  const facts: CallFacts = {
    week: { from, to },
    pulls: [],
    promises: [],
    asks: [],
    epics: [],
  }
  for (const repo of REPOS) {
    const changes = new Map<number, "story" | "defect">()
    const commits = await search(
      "search/commits",
      `repo:paulgsc/${repo} committer-date:${from}..${to} "Change-Kind:"`,
      ".items[] | {sha, message: .commit.message}",
      CommitHit
    )
    for (const c of commits) {
      const trailers = trailersOf(c.message)
      if (trailers.length > 0)
        facts.promises.push({ repo, sha: c.sha, trailers })
      const kind = changeOf(c.message)
      if (kind) changes.set(kind.pull, kind.change)
    }
    const pulls = await search(
      "search/issues",
      `repo:paulgsc/${repo} is:pr is:merged merged:${from}..${to}`,
      '.items[] | {number, title, author: (.user.login // "ghost"), mergedAt: .pull_request.merged_at, body: (.body // "")}',
      PullHit
    )
    for (const p of pulls) {
      const change = changes.get(p.number)
      facts.pulls.push({
        repo,
        number: p.number,
        title: p.title,
        author: p.author,
        mergedAt: p.mergedAt,
        ...(change === undefined ? {} : { change }),
        calls: callsOf(p.body),
      })
    }
    const asks = await search(
      "search/issues",
      `repo:paulgsc/${repo} is:issue is:open label:${ASK_LABEL}`,
      '.items[] | {number, title, createdAt: .created_at, body: (.body // "")}',
      IssueHit
    )
    for (const a of asks) {
      const { id, ask, problems } = readAskIssue(repo, a)
      facts.asks.push({
        id,
        repo,
        number: a.number,
        title: a.title,
        createdAt: a.createdAt,
        ask,
        problems,
      })
    }
    const epics = await search(
      "search/issues",
      `repo:paulgsc/${repo} is:issue label:epic updated:${from}..${to}`,
      '.items[] | {number, title, createdAt: .created_at, body: (.body // "")}',
      IssueHit
    )
    for (const e of epics)
      facts.epics.push({
        repo,
        number: e.number,
        title: e.title,
        whereWeAre: whereWeAreOf(e.body),
      })
  }
  facts.pulls.sort((a, b) => a.mergedAt.localeCompare(b.mergedAt))
  return facts
}

await runCommand(main)
