/** `motion render | prove | video | walk | promo`: the README says what each does. */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import {
  here,
  nodePorts,
  readJson,
  Refused,
  renderFolder,
  runCommand,
} from "@some-ui/video-render/node"
import { chromium } from "playwright-core"
import { z } from "zod"

import { compositionPort } from "./node"
import { HYPERFRAMES_VERSION } from "./pin"
import { promoCutList, releaseProblems, ReleaseSchema } from "./promo"
import { renderComposition } from "./render"
import { runWalk } from "./walk/run"
import type { WalkFile } from "./walk/run"
import { suspenderLedger } from "./walk/suspender-ledger"

const USAGE = [
  "usage: motion render <composition> --out <clip.mkv> [--variables <file>]",
  "       motion prove <composition> [--variables <file>] [--runs 2]",
  "       motion video <video folder> [--series <folder>] [--prove]",
  "       motion walk <app> --sample <file> --out <folder>",
  "       motion promo <release folder> --out <folder> [--prove]",
].join("\n")

/** The apps a walk can show, each by its sample's schema and its steps. */
const WALKS: ReadonlyMap<string, typeof suspenderLedger> = new Map([
  ["suspender-ledger", suspenderLedger],
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
  },
})

const chrome =
  values.chrome ??
  process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"] ??
  chromium.executablePath()

const say = (line: string): void => {
  process.stdout.write(`${line}\n`)
}

/** What `--name` was given, from where the command was typed. */
function given(name: "out" | "sample" | "variables"): string {
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
    chrome,
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
    const where = differ ? `: ${await differ(first.file, other.file)}` : ""
    throw new Refused(`${what} is not the same bytes every run${where}`)
  }
  if (times > 1) say(`${what}: the same bytes ${String(times)} times`)
}

/** Which frames of two clips differ, by each decoded frame's MD5. */
async function framesDiffering(
  dir: string,
  a: string,
  b: string
): Promise<string> {
  const sums = async (clip: string): Promise<ReadonlyArray<string>> => {
    const out = `${clip}.framemd5`
    await nodePorts(dir).ffmpeg({
      args: ["-v", "error", "-y", "-i", clip, "-f", "framemd5", out],
    })
    return (await readFile(out, "utf8"))
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => l.split(",").at(-1)?.trim() ?? "")
  }
  const [x, y] = [await sums(a), await sums(b)]
  const frames = x.flatMap((sum, i) => (sum === y[i] ? [] : [i]))
  return frames.length === 0
    ? `the same frames, ${String(x.length)} and ${String(y.length)} of them`
    : `frames ${frames.slice(0, 12).join(", ")}${frames.length > 12 ? "…" : ""} of ${String(x.length)} differ`
}

async function prove(composition: string): Promise<void> {
  const runs = Number(values.runs)
  if (!Number.isInteger(runs) || runs < 2) {
    throw new Refused(`--runs ${String(values.runs)} is not 2 or more`)
  }
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
  say(`(hyperframes ${HYPERFRAMES_VERSION}, ${chrome})`)
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
        compositions: compositionPort(folder, chrome, join(base, "draw")),
        ...(prove ? {} : { stepCacheDir: "cache" }),
      })
      await rm(join(folder, workDir), { recursive: true, force: true })
      if (!made.ok) throw new Refused(made.problems.join("\n"))
      return "video.mp4"
    })
  )
}

/** The walk of `app` in the sandbox, from `sample`, into `out`. */
async function walkInto(
  app: string,
  sample: unknown,
  out: string
): Promise<WalkFile> {
  const entry = WALKS.get(app)
  if (!entry) {
    throw new Refused(
      `there is no walk of ${app}; there are: ${[...WALKS.keys()].join(", ")}`
    )
  }
  const read = entry.sample.safeParse(sample)
  if (!read.success) throw new Refused(`the sample: ${read.error.message}`)
  await mkdir(out, { recursive: true })
  return runWalk(entry.walk(read.data), chrome, out)
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
