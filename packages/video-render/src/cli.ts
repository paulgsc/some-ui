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

import { readFile, writeFile } from "node:fs/promises"
import { dirname, join, relative, resolve as resolvePath } from "node:path"
import { parseArgs } from "node:util"

import { parseCutList } from "./cut-list"
import { nodePorts } from "./node"
import { render } from "./render"
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
  const series = parseSeries(await readJson(here(values.series)))
  if (!series.ok) fail(["The series can't be read:", ...series.problems])

  if (converting) {
    await convert(root, series.value)
    return
  }
  const cutList = parseCutList(await readJson(join(root, "cut-list.json")))
  if (!cutList.ok)
    fail(["The cut list can't be rendered as written:", ...cutList.problems])
  const done = await render(cutList.value, series.value, nodePorts(root), {
    workDir: "outputs/cache",
    out: values.out,
    withoutBurnIns: values["without-burn-ins"],
  })
  if (!done.ok) fail(["Nothing was rendered:", ...done.problems])
  process.stdout.write(
    `wrote ${join(root, done.video)} and ${join(root, done.shotTimesFile)}\n`
  )
  for (const b of done.leftOut) {
    process.stdout.write(`left out: the ${b.kind} burn-in (${b.design})\n`)
  }
}

/** A v1 short's timeline, marks and takes, to `cut-list.json`. */
async function convert(
  root: string,
  series: { id: string; version: number }
): Promise<void> {
  const timeline = await readJson(join(root, "timeline.json"))
  const ports = nodePorts(root)
  const marks = new Map<string, ReadonlyMap<string, number>>()
  const shots: unknown = Reflect.get(Object(timeline), "shots")
  for (const shot of Array.isArray(shots) ? shots : []) {
    const source: unknown = Reflect.get(Object(shot), "source")
    if (typeof source !== "string" || marks.has(source)) continue
    const file = join(root, dirname(source), "marks.json")
    // Ignored: a capture recorded with no marks has none to read; any mark a
    // timeline names is then reported missing by `fromTimelineV1`.
    const read = await readJson(file).catch(() => null)
    const list: unknown =
      read === null ? [] : Reflect.get(Object(read), "marks")
    marks.set(
      source,
      new Map(
        (Array.isArray(list) ? list : []).flatMap((m) => {
          const name: unknown = Reflect.get(Object(m), "mark")
          const t: unknown = Reflect.get(Object(m), "t")
          return typeof name === "string" && typeof t === "number"
            ? [[name, t] as const]
            : []
        })
      )
    )
  }
  const takes = new Map<string, { file: string; lengthMs: number }>()
  const takesPath: unknown = Reflect.get(Object(timeline), "takes")
  if (typeof takesPath === "string") {
    const listed: unknown = Reflect.get(
      Object(await readJson(join(root, takesPath))),
      "cuts"
    )
    for (const c of Array.isArray(listed) ? listed : []) {
      const cut: unknown = Reflect.get(Object(c), "id")
      const file: unknown = Reflect.get(
        Object(Reflect.get(Object(c), "take")),
        "file"
      )
      if (typeof cut !== "string" || typeof file !== "string") continue
      const path = relative(root, join(root, dirname(takesPath), file))
      const facts = await ports.probe(path)
      if (!facts) fail([`The take ${path} can't be read.`])
      takes.set(cut, { file: path, lengthMs: facts.durationMs })
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
