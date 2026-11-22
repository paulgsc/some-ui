/** `motion render | prove | video | walk | promo | walkthrough`: the README says what each does. */

import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { PIPELINES } from "@some-ui/engagement"
import { DEFAULT_POLICY, frictionOf } from "@some-ui/video-render"
import type {
  CutList,
  Friction,
  StillTake,
  TimedWord,
} from "@some-ui/video-render"
import {
  here,
  layAudio,
  nodePorts,
  readJson,
  Refused,
  renderFolder,
  runCommand,
  sayLines,
} from "@some-ui/video-render/node"
import { z } from "zod"

import { browserRoots, findHeadlessShell } from "./browser"
import { difference, saidOf } from "./difference"
import { compositionPort } from "./node"
import { HYPERFRAMES_VERSION } from "./pin"
import { promoCutList, releaseProblems, ReleaseSchema } from "./promo"
import { renderComposition } from "./render"
import { homeCores, homeServer } from "./walk/home-dashboards"
import { jobs } from "./walk/jobs"
import { runWalk, WalkFileSchema } from "./walk/run"
import type { Walk, WalkFile } from "./walk/run"
import { suspenderLedger } from "./walk/suspender-ledger"
import {
  voicedWalkthrough,
  walkthroughLines,
  walkthroughProblems,
  WalkthroughSchema,
} from "./walkthrough"
import type { LaidTake } from "./walkthrough"

const USAGE = [
  "usage: motion render <composition> --out <clip.mkv> [--variables <file>]",
  "       motion prove <composition> [--variables <file>] [--runs 2]",
  "       motion video <video folder> [--series <folder>] [--brand <folder>] [--prove]",
  "       motion walk <app> --sample <file> --out <folder>",
  "       motion promo <release folder> --out <folder> [--brand <folder>] [--prove]",
  "       motion walkthrough <words.json> --walk <walk folder> --out <folder> [--home <weekly.json>] [--takes <folder> | --speaker <url>] [--brand <folder>] [--prove]",
].join("\n")

/** A walk of one app: its sample's schema and the steps it makes of one. */
type WalkEntry<S> = {
  readonly sample: z.ZodType<S>
  readonly walk: (sample: S) => Walk
}

/** An entry with its sample's type kept inside it: a sample as given, read, or a refusal. */
const entry =
  <S>(e: WalkEntry<S>) =>
  (given: unknown): Walk => {
    const read = e.sample.safeParse(given)
    if (!read.success) throw new Refused(`the sample: ${read.error.message}`)
    return e.walk(read.data)
  }

/**
 * The apps a walk can show. Home's dashboards walk on its own Grafana
 * (`home-server`, `home-cores`, C1073). Suspender Ledger walks in the sandbox; Jobs on
 * the APK, inside a booted emulator (`apps/mobile/walk/walk-apk.sh`).
 */
const WALKS: ReadonlyMap<string, (sample: unknown) => Walk> = new Map([
  ["suspender-ledger", entry(suspenderLedger)],
  ["jobs", entry(jobs)],
  ["home-server", entry(homeServer)],
  ["home-cores", entry(homeCores)],
])

/** The series of a vertical whose scenes are compositions, the default. */
const VERTICAL = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../series/vertical"
)

const VariablesSchema = z.record(z.string(), z.unknown())

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string" },
    variables: { type: "string" },
    series: { type: "string" },
    sample: { type: "string" },
    fps: { type: "string", default: "30" },
    work: { type: "string" },
    chrome: { type: "string" },
    prove: { type: "boolean", default: false },
    runs: { type: "string", default: "2" },
    brand: { type: "string" },
    walk: { type: "string" },
    home: { type: "string" },
    takes: { type: "string" },
    speaker: { type: "string" },
  },
})

let chrome: string | undefined

/** The browser to draw with: `--chrome`, or Playwright's headless shell (`browser.ts`). */
function browser(): string {
  if (chrome !== undefined) return chrome
  const roots = browserRoots(process.env)
  const found = values.chrome ?? findHeadlessShell(roots)
  if (found === null) {
    throw new Refused(
      `no Chromium headless shell under ${roots.join(" or ")}; install Playwright's (\`playwright install chromium-headless-shell\`) or name one with --chrome`
    )
  }
  return (chrome = found)
}

const say = (line: string): void => {
  process.stdout.write(`${line}\n`)
}

/** What `--name` was given, from where the command was typed. */
function given(name: "out" | "sample" | "variables" | "walk"): string {
  const value = values[name]
  if (value === undefined) throw new Refused(`--${name} is needed\n${USAGE}`)
  return here(value)
}

function fps(): number {
  const n = Number(values.fps)
  if (!Number.isInteger(n) || n < 1 || n > 120) {
    throw new Refused(`--fps ${String(values.fps)} is not a whole frame rate`)
  }
  return n
}

/** A folder of the command's own under `--work`, removed once it is done. */
async function withWork<T>(job: (base: string) => Promise<T>): Promise<T> {
  const base = await mkdtemp(
    join(values.work === undefined ? tmpdir() : here(values.work), "motion-")
  )
  try {
    return await job(base)
  } finally {
    await rm(base, { recursive: true, force: true })
  }
}

/** Renders `composition` to `out`, in seconds taken. */
async function renderOnce(
  composition: string,
  out: string,
  work: string
): Promise<number> {
  const started = performance.now()
  const made = await renderComposition({
    composition,
    variables: values.variables
      ? VariablesSchema.parse(await readJson(given("variables")))
      : {},
    fps: fps(),
    out,
    work,
    chrome: browser(),
  })
  if (!made.ok) throw new Refused(made.problem)
  return (performance.now() - started) / 1000
}

async function render(composition: string): Promise<void> {
  const out = given("out")
  const seconds = await withWork((base) =>
    renderOnce(composition, out, join(base, "work"))
  )
  say(
    `${composition}: ${out} in ${seconds.toFixed(1)} s (hyperframes ${HYPERFRAMES_VERSION})`
  )
}

/**
 * Makes a file `times` times with `make`, which returns where it wrote it,
 * saying each one's sum and how long it took; refused, past the first, unless
 * every sum matches it. Each run's file is read in `dir`.
 */
async function sameBytes(
  what: string,
  times: number,
  dir: string,
  make: (run: number) => Promise<string>,
  differ?: (first: string, other: string) => Promise<string>
): Promise<void> {
  const made: Array<{ file: string; sha: string }> = []
  for (let run = 0; run < times; run++) {
    const started = performance.now()
    const file = await make(run)
    const sha = await nodePorts(dir).sha256(file)
    if (sha === null) throw new Refused(`${file} could not be read`)
    const seconds = (performance.now() - started) / 1000
    say(`${what} run ${String(run + 1)}: ${sha} in ${seconds.toFixed(1)} s`)
    made.push({ file, sha })
  }
  const [first] = made
  const other = made.find((m) => m.sha !== first?.sha)
  if (first && other) {
    const where = differ
      ? `: ${await differ(first.file, other.file).catch((error: unknown) => `the frames could not be compared (${String(error)})`)}`
      : ""
    throw new Refused(`${what} is not the same bytes every run${where}`)
  }
  if (times > 1) say(`${what}: the same bytes ${String(times)} times`)
}

/** How many differing frames `prove` says where, past which it only counts them. */
const WHERE = 4

/**
 * Which frames of two clips differ, by each decoded frame's MD5, and for the
 * first few, where in the frame (`difference.ts`).
 */
async function framesDiffering(
  dir: string,
  a: string,
  b: string
): Promise<string> {
  const ports = nodePorts(dir)
  const sums = async (
    clip: string
  ): Promise<{ sums: ReadonlyArray<string>; width: number }> => {
    const out = `${clip}.framemd5`
    await ports.ffmpeg({
      args: ["-v", "error", "-y", "-i", clip, "-f", "framemd5", out],
    })
    const text = await readFile(out, "utf8")
    const width = Number(/^#dimensions 0: (\d+)x\d+/m.exec(text)?.[1])
    return {
      sums: text
        .split("\n")
        .filter((l) => l && !l.startsWith("#"))
        .map((l) => l.split(",").at(-1)?.trim() ?? ""),
      width,
    }
  }
  const rgb = async (clip: string, frame: number): Promise<Uint8Array> => {
    const out = `${clip}.${String(frame)}.rgb`
    const made = await ports.ffmpeg({
      args: [
        "-v",
        "error",
        "-y",
        "-i",
        clip,
        "-vf",
        `select=eq(n\\,${String(frame)})`,
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        out,
      ],
    })
    if (!made.ok)
      throw new Refused(`frame ${String(frame)} of ${clip}: ${made.stderr}`)
    return readFile(out)
  }
  const [x, y] = [await sums(a), await sums(b)]
  const shared = Math.min(x.sums.length, y.sums.length)
  const frames = x.sums
    .slice(0, shared)
    .flatMap((sum, i) => (sum === y.sums[i] ? [] : [i]))
  const counts =
    x.sums.length === y.sums.length
      ? []
      : [
          `the runs drew ${String(x.sums.length)} and ${String(y.sums.length)} frames`,
        ]
  if (frames.length === 0) {
    return [`the same ${String(shared)} frames`, ...counts].join("\n  ")
  }
  const where: Array<string> = []
  if (!(x.width > 0) || !(y.width > 0)) {
    where.push(
      "the frames' size could not be read, so none is compared by pixel"
    )
  } else if (x.width !== y.width) {
    where.push("drawn at different sizes, so no frame is compared by pixel")
  } else {
    for (const frame of frames.slice(0, WHERE)) {
      try {
        const [one, two] = [await rgb(a, frame), await rgb(b, frame)]
        where.push(saidOf(frame, difference(one, two, x.width)))
      } catch (error) {
        where.push(`frame ${String(frame)}: not compared (${String(error)})`)
      }
    }
  }
  return [
    `frames ${frames.slice(0, 12).join(", ")}${frames.length > 12 ? "…" : ""} of ${String(shared)} differ`,
    ...counts,
    ...where,
  ].join("\n  ")
}

async function prove(composition: string): Promise<void> {
  const runs = Number(values.runs)
  if (!Number.isInteger(runs) || runs < 2) {
    throw new Refused(`--runs ${String(values.runs)} is not 2 or more`)
  }
  say(`(hyperframes ${HYPERFRAMES_VERSION}, ${browser()})`)
  await withWork((base) =>
    sameBytes(
      composition,
      runs,
      base,
      async (run) => {
        const file = join(base, `${String(run)}.mkv`)
        await renderOnce(composition, file, join(base, "work"))
        return file
      },
      (a, b) => framesDiffering(base, a, b)
    )
  )
}

/**
 * Renders the cut list in `folder` to `<folder>/video.mp4` through the
 * renderer, its composition scenes drawn here (HYPER2), each step kept in
 * `<folder>/cache` so a retry redraws only what changed. With `prove`, it is
 * drawn twice from nothing and refused unless the bytes match.
 */
async function renderVideo(
  folder: string,
  series: string,
  prove: boolean
): Promise<void> {
  await withWork((base) =>
    sameBytes("video.mp4", prove ? 2 : 1, folder, async (run) => {
      const workDir = `work-${String(run)}`
      const made = await renderFolder(folder, series, {
        workDir,
        out: "video.mp4",
        compositions: compositionPort(folder, browser(), join(base, "draw")),
        ...(prove ? {} : { stepCacheDir: "cache" }),
        ...(values.brand === undefined ? {} : { brand: here(values.brand) }),
      })
      await rm(join(folder, workDir), { recursive: true, force: true })
      if (!made.ok) throw new Refused(made.problems.join("\n"))
      return "video.mp4"
    })
  )
}

/** The walk of `app` on its stage, from `sample`, into `out`. */
async function walkInto(
  app: string,
  sample: unknown,
  out: string
): Promise<WalkFile> {
  const read = WALKS.get(app)
  if (!read) {
    throw new Refused(
      `there is no walk of ${app}; there are: ${[...WALKS.keys()].join(", ")}`
    )
  }
  const walked = read(sample)
  await mkdir(out, { recursive: true })
  return runWalk(walked, browser, out)
}

async function walk(app: string): Promise<void> {
  const out = given("out")
  const made = await walkInto(app, await readJson(given("sample")), out)
  say(
    `${app} ${made.version}: ${String(made.snips.length)} screens, ${String(made.taps.length)} taps, in ${out}`
  )
}

/**
 * A release's promo (HYPER3): the folder's `release.json` and its app's walk
 * from `sample.json`, into `<out>` as a cut list of three composition scenes,
 * rendered there as `video.mp4` (with `--prove`, twice from nothing).
 */
async function promo(folder: string): Promise<void> {
  const from = here(folder)
  const read = ReleaseSchema.safeParse(
    await readJson(join(from, "release.json"))
  )
  if (!read.success) throw new Refused(`the release: ${read.error.message}`)
  const release = read.data
  const out = given("out")
  const walked = await walkInto(
    release.app,
    await readJson(join(from, "sample.json")),
    out
  )
  const problems = releaseProblems(release, walked)
  if (problems.length > 0) throw new Refused(problems.join("\n"))
  const cut = promoCutList(release, walked)
  await writeFile(
    join(out, "cut-list.json"),
    `${JSON.stringify(cut, null, 1)}\n`
  )
  await renderVideo(out, VERTICAL, values.prove)
}

/** A line's take as home's speaker gave it: `<file>.json` beside `<file>.wav`. */
const TakeFileSchema = z.strictObject({
  ms: z.int().positive(),
  /** What the take says: refused where it isn't the line asked for, as a week's numbers move. */
  said: z.string(),
  words: z
    .array(
      z.strictObject({
        text: z.string().min(1),
        startMs: z.int().min(0),
        endMs: z.int().min(0),
      })
    )
    .optional(),
})

/** Every line's take in `dir`, by its file; refused where one is missing. */
async function takesIn(
  dir: string,
  lines: ReadonlyArray<{ readonly file: string; readonly said: string }>
): Promise<ReadonlyMap<string, StillTake>> {
  const takes = new Map<string, StillTake>()
  for (const { file, said } of lines) {
    const read = TakeFileSchema.safeParse(
      await readJson(join(dir, `${file}.json`))
    )
    if (!read.success)
      throw new Refused(`the take ${file}: ${read.error.message}`)
    if (read.data.said !== said)
      throw new Refused(
        `the take ${file} says "${read.data.said}", not "${said}": say lines.json again`
      )
    const words: ReadonlyArray<TimedWord> | undefined = read.data.words
    takes.set(file, { ms: read.data.ms, ...(words ? { words } : {}) })
  }
  return takes
}

/**
 * Each voiced shot's lines laid into its take, `<out>/<shot>.wav`: each line
 * from `<takes>/<line>.wav`, padded with silence to where the next starts
 * (`laid`), as `laidTake` placed their words, by the one join of per-line
 * takes (`layAudio`). Answers each laid file's own length, which bounds its
 * shot's take.
 */
async function layTakes(
  out: string,
  takes: string,
  laid: ReadonlyArray<LaidTake>
): Promise<ReadonlyMap<string, number>> {
  const ports = nodePorts(out)
  const lengths = new Map<string, number>()
  for (const shot of laid) {
    const lines = shot.lines.map((line, k) => {
      const next = shot.lines[k + 1]
      return {
        file: join(takes, line.file),
        pad:
          next === undefined
            ? null
            : { kind: "until" as const, ms: next.atMs - line.atMs },
      }
    })
    lengths.set(shot.file, await layAudio(ports, lines, shot.file))
  }
  return lengths
}

/** `cut` with each laid take ending no later than its laid file does. */
function boundedByLaid(
  cut: CutList,
  lengths: ReadonlyMap<string, number>
): CutList {
  return {
    ...cut,
    shots: cut.shots.map((shot) => {
      const laidMs = shot.take ? lengths.get(shot.take.file) : undefined
      return shot.take === undefined || laidMs === undefined
        ? shot
        : {
            ...shot,
            take: { ...shot.take, outMs: Math.min(shot.take.outMs, laidMs) },
          }
    }),
  }
}

/**
 * An app's walkthrough (WALK4, WALK5): its words (`some-ui.walkthrough/1`)
 * over a walk already made (`--walk`, a folder with `walk.json` and its
 * snips, as Snips Capture's walks artifact holds it: an APK walk needs the
 * emulator), into `<out>` as a cut list, rendered there as `video.mp4`
 * (with `--prove`, twice from nothing). It writes `lines.json` beside it,
 * every line home's speaker is asked to say (`walkthroughLines`).
 *
 * `--home` is home's weekly read (`GET /app-events/weeks/:week`), mapped
 * onto the registry as of its week's last day (`frictionOf`) and kept as
 * `friction.json` beside the render: each stop then says what real use shows
 * of it, the last names the modules nobody opens, and a card shows them.
 * `--takes` is the folder home's speaker said `lines.json` into,
 * `<file>.wav` and `<file>.json` (`{ms, words, said}`) per line: each stop is then
 * voiced, its screens held for its lines (`voicedWalkthrough`). Or
 * `--speaker` is home's Kokoro speaker (as `http://kokoro:8880`), which says
 * `lines.json` itself into `<out>/takes`, each line kept in its step cache.
 */
async function walkthrough(file: string): Promise<void> {
  const read = WalkthroughSchema.safeParse(await readJson(here(file)))
  if (!read.success) throw new Refused(`the words: ${read.error.message}`)
  const from = given("walk")
  const walked = WalkFileSchema.safeParse(
    await readJson(join(from, "walk.json"))
  )
  if (!walked.success) throw new Refused(`the walk: ${walked.error.message}`)
  let friction: Friction | null = null
  if (values.home !== undefined) {
    const home: unknown = await readJson(here(values.home))
    const parsed = frictionOf(home, PIPELINES)
    if (!parsed.ok) throw new Refused(parsed.problems.join("\n"))
    friction = parsed.value
  }
  const problems = walkthroughProblems(read.data, walked.data, friction)
  if (problems.length > 0) throw new Refused(problems.join("\n"))
  const out = given("out")
  await mkdir(out, { recursive: true })
  if (friction !== null)
    await writeFile(
      join(out, "friction.json"),
      `${JSON.stringify(friction, null, 1)}\n`
    )
  await cp(join(from, "snips"), join(out, "snips"), { recursive: true })
  const lines = walkthroughLines(
    voicedWalkthrough(read.data, walked.data, friction).cut
  )
  await writeFile(
    join(out, "lines.json"),
    `${JSON.stringify(lines, null, 1)}\n`
  )
  if (values.takes !== undefined && values.speaker !== undefined)
    throw new Refused(
      "--takes and --speaker: give the takes, or a speaker to say them"
    )
  const saidInto =
    values.speaker === undefined ? values.takes : join(out, "takes")
  let takes = new Map<string, StillTake>()
  if (values.speaker !== undefined) {
    const said = await sayLines({
      root: join(out, "takes"),
      ports: nodePorts(join(out, "takes")),
      lines,
      speaker: values.speaker,
      policy: DEFAULT_POLICY,
    })
    takes = new Map(
      lines.flatMap((l, i) => {
        const take = said[i]
        return take ? [[l.file, take] as const] : []
      })
    )
  } else if (values.takes !== undefined) {
    takes = new Map(await takesIn(here(values.takes), lines))
  }
  const voiced = voicedWalkthrough(read.data, walked.data, friction, takes)
  const cut =
    saidInto === undefined
      ? voiced.cut
      : boundedByLaid(
          voiced.cut,
          await layTakes(out, here(saidInto), voiced.laid)
        )
  await writeFile(
    join(out, "cut-list.json"),
    `${JSON.stringify(cut, null, 1)}\n`
  )
  await renderVideo(out, VERTICAL, values.prove)
}

async function main(): Promise<void> {
  const [command, name] = positionals
  if (!name) throw new Refused(USAGE)
  switch (command) {
    case "render": {
      return render(name)
    }
    case "prove": {
      return prove(name)
    }
    case "walk": {
      return walk(name)
    }
    case "promo": {
      return promo(name)
    }
    case "walkthrough": {
      return walkthrough(name)
    }
    case "video": {
      return renderVideo(
        here(name),
        values.series === undefined ? VERTICAL : here(values.series),
        values.prove
      )
    }
    default: {
      throw new Refused(USAGE)
    }
  }
}

await runCommand(main)
