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
import { chromium } from "playwright-core"
import { z } from "zod"

import { checkKit, KitSchema } from "./kit"
import type { Heard } from "./kit"
import { compositionPort } from "./node"
import { HYPERFRAMES_VERSION } from "./pin"
import { renderComposition } from "./render"

const USAGE = [
  "usage: motion render <composition> --out <clip.mkv> [--variables <file>]",
  "       motion prove <composition> [--variables <file>] [--runs 2]",
  "       motion video <video folder> [--series <folder>] [--brand <folder>] [--prove]",
  "       motion kit <kit folder>",
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
    brand: { type: "string" },
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
        ...(values.brand === undefined ? {} : { brand: here(values.brand) }),
      })
      await rm(join(folder, workDir), { recursive: true, force: true })
      if (!made.ok) throw new Refused(made.problems.join("\n"))
      return "video.mp4"
    })
  )
}

/**
 * Checks the sound kit in `folder` (home's `/brand/sounds`) against its
 * `kit.json` and prints the series' `sounds` for a new version, each pinned
 * by its sum, and one line a sound for the issue (`kit.ts`).
 */
async function kit(folder: string): Promise<void> {
  const parsed = KitSchema.safeParse(await readJson(join(folder, "kit.json")))
  if (!parsed.success) {
    throw new Refused(`${folder}/kit.json: ${parsed.error.message}`)
  }
  const ports = nodePorts(folder)
  const heard = new Map<string, Heard>()
  for (const entry of Object.values(parsed.data.sounds)) {
    const file = join(folder, entry.file)
    const facts = await ports.probe(file)
    heard.set(entry.file, {
      sha256: await ports.sha256(file),
      durationMs: facts?.durationMs ?? null,
      picture: (facts?.width ?? 0) > 0,
    })
  }
  const checked = checkKit(parsed.data, heard)
  if (!checked.ok) throw new Refused(checked.problems.join("\n"))
  say(JSON.stringify({ sounds: checked.sounds }, null, 2))
  for (const line of checked.record) say(line)
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
    case "kit": {
      return kit(here(name))
    }
    default: {
      throw new Refused(USAGE)
    }
  }
}

await runCommand(main)
