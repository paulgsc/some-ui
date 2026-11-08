/** `motion render` and `motion prove`: the README says what each does. */

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseArgs } from "node:util"
import {
  here,
  nodePorts,
  readJson,
  Refused,
  runCommand,
} from "@some-ui/video-render/node"
import { chromium } from "playwright-core"
import { z } from "zod"

import { HYPERFRAMES_VERSION } from "./pin"
import { renderComposition } from "./render"

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string" },
      variables: { type: "string" },
      fps: { type: "string", default: "30" },
      work: { type: "string" },
      chrome: { type: "string" },
    },
  })
  const [command, composition] = positionals
  if ((command !== "render" && command !== "prove") || !composition) {
    throw new Refused(
      "usage: motion render <composition> --out <clip.mkv> | motion prove <composition>"
    )
  }
  const fps = Number(values.fps)
  if (!Number.isInteger(fps) || fps < 1 || fps > 120) {
    throw new Refused(`--fps ${String(values.fps)} is not a whole frame rate`)
  }
  const out = values.out === undefined ? undefined : here(values.out)
  if (command === "render" && !out) {
    throw new Refused("render needs --out <clip.mkv>")
  }
  const chrome =
    values.chrome ??
    process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"] ??
    chromium.executablePath()
  const variables = values.variables
    ? VariablesSchema.parse(await readJson(here(values.variables)))
    : {}
  const base = await mkdtemp(
    join(values.work === undefined ? tmpdir() : here(values.work), "motion-")
  )

  const once = async (to: string): Promise<number> => {
    const started = performance.now()
    const made = await renderComposition({
      composition,
      variables,
      fps,
      out: to,
      work: join(base, "work"),
      chrome,
    })
    if (!made.ok) throw new Refused(made.problem)
    return (performance.now() - started) / 1000
  }

  try {
    if (out) {
      const seconds = await once(out)
      process.stdout.write(
        `${composition}: ${out} in ${seconds.toFixed(1)} s (hyperframes ${HYPERFRAMES_VERSION})\n`
      )
      return
    }
    const runs: Array<{ sha: string; seconds: number }> = []
    for (const name of ["a.mkv", "b.mkv"]) {
      const file = join(base, name)
      const seconds = await once(file)
      const sha = await nodePorts(base).sha256(file)
      if (sha === null) throw new Refused(`${file} could not be read`)
      runs.push({ sha, seconds })
    }
    for (const [i, r] of runs.entries()) {
      process.stdout.write(
        `${composition} run ${String(i + 1)}: ${r.sha} in ${r.seconds.toFixed(1)} s\n`
      )
    }
    if (runs[0]?.sha !== runs[1]?.sha) {
      throw new Refused(`${composition} is not the same bytes twice`)
    }
    process.stdout.write(
      `${composition}: the same bytes twice (hyperframes ${HYPERFRAMES_VERSION}, ${chrome})\n`
    )
  } finally {
    await rm(base, { recursive: true, force: true })
  }
}

const VariablesSchema = z.record(z.string(), z.unknown())

await runCommand(main)
