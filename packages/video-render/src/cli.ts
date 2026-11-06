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
 *   pnpm --filter @some-ui/video-render render call-check <week.json>
 *
 * checks a week's data against the call's schema (`call.ts`) and prints
 * every reason it can't make a call.
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
import { access, writeFile } from "node:fs/promises"
import { dirname, join, relative, resolve as resolvePath } from "node:path"
import { parseArgs, promisify } from "node:util"
import { z } from "zod"

import { ASK_LABEL, parseAskBody } from "./ask"
import { callScenes, parseCallWeek } from "./call"
import { callsOf, changeKindOf, trailersOf, whereWeAreOf } from "./call-facts"
import type { CallFacts } from "./call-facts"
import { problemsOf } from "./cut-list"
import { compareHearings } from "./hearings"
import { nodePorts, readJson, readSeries, renderFolder } from "./node"
import { fromTimelineV1 } from "./timeline-v1"

const here = (p: string): string =>
  resolvePath(process.env["INIT_CWD"] ?? process.cwd(), p)

/** Stops the command, saying why; `main` prints it and sets the exit code. */
class Refused extends Error {}

function fail(lines: ReadonlyArray<string>): never {
  throw new Refused(lines.join("\n"))
}

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
    if (!second) fail(["usage: render call-check <week.json>"])
    const week = parseCallWeek(await readJson(here(second)))
    if (!week.ok) fail([`${second} can't make a call:`, ...week.problems])
    process.stdout.write(
      `${second}: ${callScenes(week.value).length} scenes, ready\n`
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

const REPOS = ["some-ui", "server"] as const

/** Every result of a GitHub search, one JSON value per `jq` line. */
async function search(
  endpoint: "search/issues" | "search/commits",
  q: string,
  jq: string
): Promise<Array<unknown>> {
  const { stdout } = await run(
    "gh",
    [
      "api",
      "-X",
      "GET",
      endpoint,
      "-f",
      `q=${q}`,
      "-f",
      "per_page=100",
      "--paginate",
      "--jq",
      jq,
    ],
    { maxBuffer: 64 * 1024 * 1024 }
  )
  return stdout
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line): unknown => JSON.parse(line))
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

const hits = <T>(schema: z.ZodType<T>, values: Array<unknown>): Array<T> =>
  values.map((v) => schema.parse(v))

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
    const pulls = hits(
      PullHit,
      await search(
        "search/issues",
        `repo:paulgsc/${repo} is:pr is:merged merged:${from}..${to}`,
        '.items[] | {number, title, author: .user.login, mergedAt: .pull_request.merged_at, body: (.body // "")}'
      )
    )
    for (const p of pulls)
      facts.pulls.push({
        repo,
        number: p.number,
        title: p.title,
        author: p.author,
        mergedAt: p.mergedAt,
        change: changeKindOf(p.body),
        calls: callsOf(p.body),
      })
    const commits = hits(
      CommitHit,
      await search(
        "search/commits",
        `repo:paulgsc/${repo} committer-date:${from}..${to} "Promise:"`,
        ".items[] | {sha, message: .commit.message}"
      )
    )
    for (const c of commits) {
      const trailers = trailersOf(c.message)
      if (trailers.length > 0)
        facts.promises.push({ repo, sha: c.sha, trailers })
    }
    const asks = hits(
      IssueHit,
      await search(
        "search/issues",
        `repo:paulgsc/${repo} is:issue is:open label:${ASK_LABEL}`,
        '.items[] | {number, title, createdAt: .created_at, body: (.body // "")}'
      )
    )
    for (const a of asks) {
      const read = parseAskBody(a.body)
      facts.asks.push({
        repo,
        number: a.number,
        title: a.title,
        createdAt: a.createdAt,
        body: a.body,
        problems: read.ok ? [] : [...read.problems],
      })
    }
    const epics = hits(
      IssueHit,
      await search(
        "search/issues",
        `repo:paulgsc/${repo} is:issue label:epic updated:${from}..${to}`,
        '.items[] | {number, title, createdAt: .created_at, body: (.body // "")}'
      )
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

try {
  await main()
} catch (e) {
  if (!(e instanceof Refused)) throw e
  process.stderr.write(`${e.message}\n`)
  process.exitCode = 1
}
