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
 *   pnpm --filter @some-ui/video-render render cards-check <cards folder>
 *
 * checks paulgsc/testing's `cards/` folder before it is published
 * (`cardsFolderProblems`, CARDS7): its index, every essay it lists as a
 * cards essay in a version of its series this checkout holds, and no essay
 * file it forgets. What only drawing finds is `record:cards`' to refuse.
 *
 *   pnpm --filter @some-ui/video-render render clip-check <clips folder>
 *
 * checks paulgsc/testing's `clips/` folder before it is pushed
 * (`clipFolderProblems`, SFEED7).
 *
 *   pnpm --filter @some-ui/video-render render session-check <sessions folder>
 *
 * checks a `sessions/` folder of `paulgsc/testing` before it is pushed
 * (`sessionFolderProblems`, SFEED9).
 *
 *   pnpm --filter @some-ui/video-render render compare-hearings <home transcript> <session words>
 *
 * lines up two hearings of one take (ST25, `hearings.ts`) and prints the
 * comparison as JSON: home's transcript as the Jobs mailbox holds it
 * (`transcript-<note>-<n>.json`), and the session's words (`WordsSchema`).
 *
 *   pnpm --filter @some-ui/video-render render music-bed --out <file>
 *
 * writes the music bed (`music-bed.ts`), refusing bytes its pin doesn't name.
 *
 *   pnpm --filter @some-ui/video-render render sounds --out <folder>
 *
 * writes the sound kit's six cues (`cues.ts`, HYPER4) into the folder, home's
 * `${STORAGE}/brand/sounds`, refusing all of them if one's pin doesn't name it.
 *
 *   pnpm --filter @some-ui/video-render render pending <transcripts.json> <filed.json> [feedback.json] [pickups.json picked.json]
 *
 * prints the Studio takes and the notes on episodes left to file as pending
 * issues (`pending.ts`): from the mailbox's transcripts (a list of their
 * bodies), the issues already filed (a list of their bodies, or of issues
 * each with its `body` and its `repo` and `number`, or its `html_url`) and, when given, the mailbox's
 * `feedback` folder (a list of its bodies), its `pickup` folder (a list of
 * its bodies) and the names in its `picked` folder (a list of names).
 *
 * `pnpm --filter` runs this from the package; INIT_CWD is where it was typed.
 */

import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { access, mkdir, readdir, writeFile } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { parseArgs, promisify } from "node:util"
import { z } from "zod"

import { ASK_LABEL, readAskIssue } from "./ask"
import { callFolderProblems } from "./call"
import {
  callsEntered,
  changeOf,
  trailersOf,
  whereWeAreOf,
  whyOf,
} from "./call-facts"
import type { CallFacts } from "./call-facts"
import { CARDS_SERIES, cardsFolderProblems } from "./cards-essay"
import { clipFolderProblems, parseClipIndex } from "./clip"
import { CUES, cueWav } from "./cues"
import { problemsOf } from "./cut-list"
import { compareHearings } from "./hearings"
import { MUSIC_BED, musicBedWav } from "./music-bed"
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
import { FiledSchema, toFile } from "./pending"
import { WORK_REPOS } from "./refs"
import type { Series } from "./series"
import { versionOfFile } from "./series"
import { sessionFolderProblems } from "./session-note"
import { fromTimelineV1 } from "./timeline-v1"
import { SOUNDS } from "./vocabulary"

/** The series this checkout holds, as home's image does. */
const SAMPLE_SERIES = join(import.meta.dirname, "sample/series")

/** The JSON files directly in `dir`, by name. */
async function readJsonFolder(dir: string): Promise<Map<string, unknown>> {
  const files = new Map<string, unknown>()
  for (const name of (await readdir(dir)).filter((n) => n.endsWith(".json")))
    files.set(name, await readJson(join(dir, name)))
  return files
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
  const [first, second, third, fourth, fifth, sixth] = positionals
  if (first === "music-bed") {
    if (!values.out.endsWith(".wav"))
      fail(["usage: render music-bed --out <file>.wav"])
    const wav = musicBedWav()
    const sum = createHash("sha256").update(wav).digest("hex")
    if (sum !== MUSIC_BED.sha256)
      fail([
        `The bed came out as ${sum}, and its pin is ${MUSIC_BED.sha256}; nothing was written`,
      ])
    await writeFile(here(values.out), wav)
    process.stdout.write(
      `wrote ${here(values.out)}, ${sum}; lay it in brand/ as ${MUSIC_BED.file}\n`
    )
    return
  }
  if (first === "sounds") {
    if (values.out === "outputs/video.mp4")
      fail(["usage: render sounds --out <folder>"])
    const folder = here(values.out)
    const made = SOUNDS.map((sound) => {
      const wav = cueWav(sound)
      return { sound, wav, sum: createHash("sha256").update(wav).digest("hex") }
    })
    const off = made.filter(({ sound, sum }) => sum !== CUES[sound].sha256)
    if (off.length > 0)
      fail([
        ...off.map(
          ({ sound, sum }) =>
            `The ${sound} came out as ${sum}, and its pin is ${CUES[sound].sha256}`
        ),
        "nothing was written",
      ])
    await mkdir(folder, { recursive: true })
    for (const { sound, wav, sum } of made) {
      await writeFile(join(folder, CUES[sound].file), wav)
      process.stdout.write(`${sound}: ${CUES[sound].file}, ${sum}\n`)
    }
    process.stdout.write(`wrote the kit to ${folder}\n`)
    return
  }
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
  if (first === "pending") {
    if (!second || !third || (fifth !== undefined) !== (sixth !== undefined))
      fail([
        "usage: render pending <transcripts.json> <filed.json> [feedback.json] [pickups.json picked.json]",
      ])
    const transcripts = await readAs(z.array(z.unknown()), here(second))
    const filed = await readAs(FiledListSchema, here(third))
    const feedback = fourth
      ? await readAs(z.array(z.unknown()), here(fourth))
      : []
    const pickups = fifth ? await readAs(z.array(z.unknown()), here(fifth)) : []
    const picked = sixth ? await readAs(z.array(z.string()), here(sixth)) : []
    process.stdout.write(
      `${JSON.stringify(toFile(transcripts, filed, feedback, Date.now(), pickups, picked), null, 1)}\n`
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
    const files = await readJsonFolder(here(second))
    const problems = callFolderProblems(files)
    if (problems.length > 0)
      fail([`${second} can't be published:`, ...problems])
    const weeks = files.size - 1
    process.stdout.write(
      `${second}: ${weeks} ${weeks === 1 ? "week" : "weeks"}, ready
`
    )
    return
  }
  if (first === "cards-check") {
    if (!second) fail(["usage: render cards-check <cards folder>"])
    const files = await readJsonFolder(here(second))
    // The series home's image holds: this checkout's samples of each.
    const held = new Map<string, Series>()
    for (const id of CARDS_SERIES)
      for (const file of await readdir(join(SAMPLE_SERIES, id))) {
        const version = versionOfFile(file)
        if (version === null) continue
        const series = await readSeries(join(SAMPLE_SERIES, id), version)
        if (series.ok) held.set(`${id}@${version}`, series.value)
      }
    const problems = cardsFolderProblems(
      files,
      (id, version) => held.get(`${id}@${version}`) ?? null
    )
    if (problems.length > 0)
      fail([`${second} can't be published:`, ...problems])
    const essays = files.size - 1
    process.stdout.write(
      `${second}: ${essays} ${essays === 1 ? "essay" : "essays"}, ready\n`
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
  if (first === "session-check") {
    if (!second) fail(["usage: render session-check <sessions folder>"])
    const files = await readJsonFolder(here(second))
    const problems = sessionFolderProblems(files)
    if (problems.length > 0)
      fail([`${second} can't be published:`, ...problems])
    process.stdout.write(
      `${second}: ${files.size} ${files.size === 1 ? "note" : "notes"}, ready\n`
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

/** The issues already filed (`pending.ts`' `FiledSchema`). */
const FiledListSchema = z.array(FiledSchema)

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
})
const CommitHit = z.object({ sha: z.string(), message: z.string() })
const IssueHit = z.object({
  number: z.number(),
  title: z.string(),
  createdAt: z.string(),
  body: z.string(),
})

/** The calls record's path in some-ui. */
const CALLS_RECORD = "docs/calls.json"

/**
 * The calls record on this checkout's history as it stood at `day`'s start
 * (UTC): null when there was none yet. The weekly run starts from some-ui's
 * `main` (`CALL-ROUTINE.md`, step 1), with history back to the week's start.
 */
async function recordAt(day: string): Promise<string | null> {
  const root = (
    await run("git", ["rev-parse", "--show-toplevel"])
  ).stdout.trim()
  const commit = (
    await run("git", [
      "-C",
      root,
      "rev-list",
      "-1",
      "--first-parent",
      `--before=${day}T00:00:00Z`,
      "HEAD",
    ])
  ).stdout.trim()
  if (commit === "")
    fail([
      `no commit before ${day} on this checkout: fetch main's history back to the week's start`,
    ])
  const at = `${commit}:${CALLS_RECORD}`
  try {
    await run("git", ["-C", root, "cat-file", "-e", at])
  } catch {
    return null
  }
  try {
    return (await run("git", ["-C", root, "show", at])).stdout
  } catch {
    return fail([`${CALLS_RECORD} at ${commit} could not be read`])
  }
}

/** The day after `day`. */
const dayAfter = (day: string): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10)

/** The weekly call's facts for `from`..`to`, both days included. */
async function callFacts(from: string, to: string): Promise<CallFacts> {
  const facts: CallFacts = {
    week: { from, to },
    pulls: [],
    calls: [],
    promises: [],
    asks: [],
    epics: [],
  }
  const after = await recordAt(dayAfter(to))
  if (after !== null)
    facts.calls.push(...callsEntered(await recordAt(from), after))
  for (const repo of WORK_REPOS) {
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
      '.items[] | {number, title, author: (.user.login // "ghost"), mergedAt: .pull_request.merged_at}',
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
        why: whyOf(e.body),
        whereWeAre: whereWeAreOf(e.body),
      })
  }
  facts.pulls.sort((a, b) => a.mergedAt.localeCompare(b.mergedAt))
  return facts
}

await runCommand(main)
