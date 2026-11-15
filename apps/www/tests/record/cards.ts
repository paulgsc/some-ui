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
 * A spoken essay (the cheat-sheet series from version 2, C370, C371) is said as
 * the weekly call is (`./call`): `--voices kokoro` has home's Kokoro speaker
 * at `--speaker` say the intro, each scene's chapter line in the host's
 * voice and its narration in the narrator's, and the close
 * (`cardsLines`), each with its words' times (`/timed`); each card holds for
 * its take, with the words captioned at the frame's foot
 * (`voicedCardsCutList`). `--voices none` holds each card for its words'
 * reading time, with nothing said. An essay whose words alone run past
 * `--max-video-minutes` is refused before the speaker is asked. A silent
 * essay (version 1) is drawn as it was first served, and no speaker is asked.
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
  isSpokenEssay,
  parseCardsEssay,
  voicedCardsCutList,
} from "@some-ui/video-render"
import type { StillTake } from "@some-ui/video-render"

import { CALL_OPTIONS } from "./call-recording"
import { fail, here, launchChromium, runCommand } from "./command"
import {
  placeBed,
  policyOf,
  refuseLong,
  renderCut,
  siteOf,
  speakerFlag,
  speakerOf,
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
  const lines = spoken ? cardsLines(essay.value) : []
  refuseLong(lines, policy)
  const root = join(here(values.out), key)
  await mkdir(root, { recursive: true })
  await writeFile(join(root, "essay.json"), written)

  // Each line said, in order, as the call's scenes are (`./voiced`). Home's
  // board says "scene k of n" from `scenes <n>` and each `recorded <file>`
  // (paulgsc/server's render worker reads them).
  const takes: Array<StillTake | null> = []
  if (spoken) {
    const say = speaker === null ? null : await speakerOf(root, speaker, policy)
    console.log(`scenes ${String(lines.length)}`)
    for (const line of lines) {
      takes.push(
        say === null || line.said === ""
          ? null
          : await say({
              file: line.file,
              text: line.said,
              voice: line.voice,
              timed: true,
            })
      )
      console.log(`recorded ${line.file}`)
    }
  }

  // The brand files the series names, from home's brand folder (`--brand`).
  const series = join(SERIES, essay.value.series.id)
  await placeBed(series, essay.value.series.version, values.brand, root)
  const site = await siteOf(values)
  const browser = await launchChromium()
  try {
    await renderCut(
      root,
      series,
      spoken ? voicedCardsCutList(essay.value, lines, takes) : essay.value,
      {
        preview: false,
        episode: "cards.mp4",
        marks: () => cardsChapterMarks(lines),
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
