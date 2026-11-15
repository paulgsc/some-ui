/**
 * Records and renders one cards essay (CARDS7 #2979, EXPLAIN6 #3021): its
 * cut list, every scene a card, drawn by the built app's burn-ins page
 * (`./burn-ins`) and laid together by the renderer
 * (`@some-ui/video-render`).
 *
 *   pnpm --filter www build
 *   pnpm --filter www record:cards --cut-list-file <key>.json [--voices kokoro] [--speaker http://127.0.0.1:8880] [--out out/cards]
 *   pnpm --filter www record:cards --dist /opt/stage --cut-list-file <key>.json --voices kokoro --speaker http://kokoro:8880 --brand /brand --out <dir>
 *
 * `--cut-list-file` is an essay as home keeps it, `<key>.json`, its name its
 * key (`parseCardsEssay`): a cut list in a cards series whose stamp's day
 * ends its key. It is refused before anything is drawn or said when it isn't
 * one. It writes `<out>/<key>/cards.mp4`, with `cut-list.json` (what was
 * drawn), `essay.json` (the essay as written) and `shot-times.json` beside
 * it, and `description.txt`, the upload's chapters, when it has enough.
 *
 * A spoken essay (cheat-sheet v2, C370, C371) is said as the weekly call
 * is (`./call`): `--voices kokoro --speaker <url>` has home's Kokoro say
 * each line (`cardsLines`) with its words' times, and each card holds for
 * its take, captioned (`voicedCardsCutList`); `--voices none` holds each
 * for its reading time, silent. A silent essay (v1) is drawn as first
 * served, and no speaker is asked.
 *
 * It takes the flags every home recorder takes (`CALL_OPTIONS`). Policy, the
 * step cache (which keeps each take by its words, voice and model) and
 * `--brand` are the call's (`./call` says how). Needs `ffmpeg` and `ffprobe`
 * on `PATH`.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { parseArgs } from "node:util"
import {
  cardsChapterMarks,
  cardsLines,
  cardsScenes,
  CHAPTER_GAP_MS,
  isSpokenEssay,
  joinedTake,
  parseCardsEssay,
  QUIET,
  voicedCardsCutList,
} from "@some-ui/video-render"
import type { CardsScene, StillTake } from "@some-ui/video-render"
import { nodePorts } from "@some-ui/video-render/node"

import { CALL_OPTIONS } from "./call-recording"
import { fail, here, launchChromium, runCommand } from "./command"
import {
  placeBed,
  policyOf,
  refuseLong,
  renderCut,
  sayLines,
  siteOf,
  speakerFlag,
} from "./voiced"

/** The series an essay may be drawn in, sampled in the renderer's workspace. */
const SERIES = resolve(
  import.meta.dirname,
  "../../../../packages/video-render/src/sample/series"
)

const { values } = parseArgs({
  options: {
    "cut-list-file": { type: "string" },
    out: { type: "string", default: "out/cards" },
    ...CALL_OPTIONS,
  },
})

/**
 * Each scene's take, from `said`, its lines' takes in order: a line's own
 * where it is the scene's only one, else its lines' audio joined into
 * `<file>.wav`, `CHAPTER_GAP_MS` of silence between (`joinedTake`). None
 * where nothing was said.
 */
async function sceneTakes(
  root: string,
  scenes: ReadonlyArray<CardsScene>,
  said: ReadonlyArray<StillTake | null>
): Promise<Array<StillTake | null>> {
  const ports = nodePorts(root)
  let next = 0
  const takes: Array<StillTake | null> = []
  for (const scene of scenes) {
    const own = said.slice(next, next + scene.lines.length)
    next += scene.lines.length
    const heard = own.filter((take) => take !== null)
    if (heard.length < scene.lines.length) {
      takes.push(null)
      continue
    }
    if (heard.length === 1) {
      takes.push(heard[0] ?? null)
      continue
    }
    const pad = `apad=pad_dur=${String(CHAPTER_GAP_MS / 1000)}`
    const inputs = scene.lines.flatMap((line) => ["-i", `${line.file}.wav`])
    const filter = `${scene.lines
      .map((_, i) =>
        i < scene.lines.length - 1
          ? `[${String(i)}:a]${pad}[p${String(i)}];`
          : ""
      )
      .join("")}${scene.lines
      .map((_, i) =>
        i < scene.lines.length - 1 ? `[p${String(i)}]` : `[${String(i)}:a]`
      )
      .join("")}concat=n=${String(scene.lines.length)}:v=0:a=1`
    const joined = await ports.ffmpeg({
      args: [
        ...QUIET,
        ...inputs,
        "-filter_complex",
        filter,
        `${scene.file}.wav`,
      ],
    })
    if (!joined.ok)
      fail([`${scene.file}'s takes can't be joined:`, joined.stderr])
    // Each take's length was rounded to a whole ms: the joined file's own
    // bounds the take, so it never runs past the audio.
    const facts = await ports.probe(`${scene.file}.wav`)
    if (!facts) fail([`${scene.file}.wav can't be read`])
    const take = joinedTake(heard)
    takes.push({ ...take, ms: Math.min(take.ms, Math.floor(facts.durationMs)) })
  }
  return takes
}

async function main(): Promise<void> {
  const file = values["cut-list-file"]
  if (!file) fail(["usage: record:cards --cut-list-file <key>.json"])
  const key = basename(file, ".json")
  const written = await readFile(here(file))
  const essay = parseCardsEssay(key, JSON.parse(written.toString("utf8")))
  if (!essay.ok) fail([`${file} isn't a cards essay:`, ...essay.problems])
  const policy = policyOf(values)
  const speaker = speakerFlag(values)
  const spoken = isSpokenEssay(essay.value)
  const scenes = spoken ? cardsScenes(essay.value) : []
  refuseLong(scenes, policy)
  const root = join(here(values.out), key)
  await mkdir(root, { recursive: true })
  await writeFile(join(root, "essay.json"), written)

  const takes = spoken
    ? await sceneTakes(
        root,
        scenes,
        await sayLines({ root, lines: cardsLines(scenes), speaker, policy })
      )
    : []

  // The brand files the series names, from home's brand folder (`--brand`).
  const series = join(SERIES, essay.value.series.id)
  await placeBed(series, essay.value.series.version, values.brand, root)
  const site = await siteOf(values)
  const browser = await launchChromium()
  try {
    await renderCut(
      root,
      series,
      spoken ? voicedCardsCutList(essay.value, scenes, takes) : essay.value,
      {
        preview: false,
        episode: "cards.mp4",
        marks: () => cardsChapterMarks(scenes),
        policy,
        browser,
        origin: site.origin,
      }
    )
  } finally {
    await browser.close()
    await site.close()
  }
}

await runCommand(main)
