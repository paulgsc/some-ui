/**
 * The renderer from a shell, in a session or on home:
 *
 *   pnpm --filter @some-ui/video-render render <video folder> --series <series.json>
 *       [--out outputs/video.mp4] [--without-burn-ins]
 *
 * reads `<video folder>/cut-list.json` and writes the video and
 * `shot-times.json` beside it.
 *
 *   pnpm --filter @some-ui/video-render render from-timeline <short folder> --series <series.json>
 *
 * reads a v1 short (`timeline.json`, the recorder's `marks.json` beside each
 * capture, and `voice/takes.json` when the timeline names it) and writes
 * `<short folder>/cut-list.json`.
 *
 * `pnpm --filter` runs this from the package; INIT_CWD is where it was typed.
 */

import { access, readFile, writeFile } from "node:fs/promises"
import { dirname, join, relative, resolve as resolvePath } from "node:path"
import { parseArgs } from "node:util"
import { z } from "zod"

import { problemsOf } from "./cut-list"
import { nodePorts, renderFolder } from "./node"
import { parseSeries } from "./series"
import { fromTimelineV1 } from "./timeline-v1"

const here = (p: string): string =>
  resolvePath(process.env["INIT_CWD"] ?? process.cwd(), p)

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8"))
}

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
    },
  })
  const [first, second] = positionals
  const converting = first === "from-timeline"
  const folder = converting ? second : first
  if (!folder || !values.series) {
    fail(["usage: render [from-timeline] <folder> --series <series.json>"])
  }
  const root = here(folder)
  if (converting) {
    const series = parseSeries(await readJson(here(values.series)))
    if (!series.ok) fail(["The series can't be read:", ...series.problems])
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

try {
  await main()
} catch (e) {
  if (!(e instanceof Refused)) throw e
  process.stderr.write(`${e.message}\n`)
  process.exitCode = 1
}
