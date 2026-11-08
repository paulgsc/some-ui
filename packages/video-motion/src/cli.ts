/** `motion render | prove | video`: the README says what each does. */

import { mkdtemp, readFile, rm } from "node:fs/promises"
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
import { z } from "zod"

import { browserRoots, findHeadlessShell } from "./browser"
import { difference, saidOf } from "./difference"
import { compositionPort } from "./node"
import { HYPERFRAMES_VERSION } from "./pin"
import { renderComposition } from "./render"

const USAGE = [
  "usage: motion render <composition> --out <clip.mkv> [--variables <file>]",
  "       motion prove <composition> [--variables <file>] [--runs 2]",
  "       motion video <video folder> [--series <folder>] [--prove]",
].join("\n")

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
    fps: { type: "string", default: "30" },
    work: { type: "string" },
    chrome: { type: "string" },
    prove: { type: "boolean", default: false },
    runs: { type: "string", default: "2" },
  },
})

/** The browser to draw with: `--chrome`, or Playwright's headless shell (`browser.ts`). */
function browser(): string {
  const found = values.chrome ?? findHeadlessShell(browserRoots(process.env))
  if (found === null) {
    throw new Refused(
      `no Chromium headless shell under ${browserRoots(process.env).join(" or ")}; install Playwright's (\`playwright install chromium-headless-shell\`) or name one with --chrome`
    )
  }
  return found
}

const say = (line: string): void => {
  process.stdout.write(`${line}\n`)
}

/** What `--name` was given, from where the command was typed. */
function given(name: "out" | "variables"): string {
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
    const where = differ ? `: ${await differ(first.file, other.file)}` : ""
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
    const lines = (await readFile(out, "utf8")).split("\n")
    const width = Number(
      /^#dimensions 0: (\d+)x\d+/m.exec(lines.join("\n"))?.[1]
    )
    return {
      sums: lines
        .filter((l) => l && !l.startsWith("#"))
        .map((l) => l.split(",").at(-1)?.trim() ?? ""),
      width,
    }
  }
  const rgb = async (clip: string, frame: number): Promise<Uint8Array> => {
    const out = `${clip}.${String(frame)}.rgb`
    const made = await ports.ffmpeg({
      args: [
        ...[
          "-v",
          "error",
          "-y",
          "-i",
          clip,
          "-vf",
          `select=eq(n\\,${String(frame)})`,
        ],
        ...["-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", out],
      ],
    })
    if (!made.ok)
      throw new Refused(`frame ${String(frame)} of ${clip}: ${made.stderr}`)
    return readFile(out)
  }
  const [x, y] = [await sums(a), await sums(b)]
  const frames = x.sums.flatMap((sum, i) => (sum === y.sums[i] ? [] : [i]))
  if (frames.length === 0) {
    return `the same frames, ${String(x.sums.length)} and ${String(y.sums.length)} of them`
  }
  const where: Array<string> = []
  if (Number.isInteger(x.width) && x.width > 0) {
    for (const frame of frames.slice(0, WHERE)) {
      where.push(
        saidOf(
          frame,
          difference(await rgb(a, frame), await rgb(b, frame), x.width)
        )
      )
    }
  }
  return [
    `frames ${frames.slice(0, 12).join(", ")}${frames.length > 12 ? "…" : ""} of ${String(x.sums.length)} differ`,
    ...where,
  ].join("\n  ")
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
  say(`(hyperframes ${HYPERFRAMES_VERSION}, ${browser()})`)
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
      })
      await rm(join(folder, workDir), { recursive: true, force: true })
      if (!made.ok) throw new Refused(made.problems.join("\n"))
      return "video.mp4"
    })
  )
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
