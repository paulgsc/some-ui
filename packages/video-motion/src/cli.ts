/** `motion render | prove | video`: the README says what each does. */

import { mkdtemp, rm } from "node:fs/promises"
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
import { renderComposition } from "./render"

const USAGE = [
  "usage: motion render <composition> --out <clip.mkv> [--variables <file>]",
  "       motion prove <composition> [--variables <file>]",
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
  make: (run: number) => Promise<string>
): Promise<void> {
  const sums: Array<string> = []
  for (let run = 0; run < times; run++) {
    const started = performance.now()
    const file = await make(run)
    const sha = await nodePorts(dir).sha256(file)
    if (sha === null) throw new Refused(`${file} could not be read`)
    const seconds = (performance.now() - started) / 1000
    say(`${what} run ${String(run + 1)}: ${sha} in ${seconds.toFixed(1)} s`)
    sums.push(sha)
  }
  if (sums.some((sha) => sha !== sums[0])) {
    throw new Refused(`${what} is not the same bytes twice`)
  }
  if (times > 1) say(`${what}: the same bytes twice`)
}

async function prove(composition: string): Promise<void> {
  await withWork((base) =>
    sameBytes(composition, 2, base, async (run) => {
      const file = join(base, `${String(run)}.mkv`)
      await renderOnce(composition, file, join(base, "work"))
      return file
    })
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
