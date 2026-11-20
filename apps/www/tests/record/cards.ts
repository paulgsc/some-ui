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
 * A spoken essay may hold spoken cards (WALK7, C810: `spoken-card.ts`): the
 * owner's own takes from home, in their category's template. Then
 * `--takes <dir>` is the folder home hands over, for each take the cut list
 * names, its audio `<id>.<ext>`, its word times `<id>.words.json` where home
 * kept them, and its transcript `<id>.transcript.json`
 * (`some-ui.voice-transcript/1`, its verdict with it). A take missing, or
 * one home couldn't make out or heard nothing in, is refused before
 * anything is drawn (HEARD2). Each question is said in the asker's voice and
 * each take played whole, under a still of the card's scene from the built
 * app's `/essay?kind=spoken` (template A). With no spoken card it takes no
 * `--takes`, and records as it always has.
 *
 * It takes the flags every home recorder takes (`CALL_OPTIONS`). Policy, the
 * step cache (which keeps each take by its words, voice and model) and
 * `--brand` are the call's (`./call` says how). Needs `ffmpeg` and `ffprobe`
 * on `PATH`.
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { parseArgs } from "node:util"
import type { Page } from "@playwright/test"
import {
  cardsChapterMarks,
  cardsLines,
  cardsScenes,
  CHAPTER_GAP_MS,
  heardSpokenCard,
  isSpokenEssay,
  joinedTake,
  parseCardsEssay,
  QUIET,
  spokenCardsOf,
  spokenTakeFilesOf,
  spokenTakesOf,
  voicedCardsCutList,
} from "@some-ui/video-render"
import type {
  CardsScene,
  CutList,
  HeardSpokenCard,
  SpokenTakeFiles,
  StillTake,
} from "@some-ui/video-render"
import { nodePorts } from "@some-ui/video-render/node"

import { CALL_OPTIONS, FRAME } from "./call-recording"
import { fail, here, launchChromium, runCommand } from "./command"
import {
  ownTake,
  placeBed,
  policyOf,
  refuseLong,
  renderCut,
  sayLines,
  shownFrame,
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
    takes: { type: "string" },
    ...CALL_OPTIONS,
  },
})

/**
 * Each scene's take, from `said`, its lines' takes in order: a spoken
 * card's answer the owner's own take from `owned`; a line's own
 * where it is the scene's only one, else its lines' audio joined into
 * `<file>.wav`, `CHAPTER_GAP_MS` of silence between (`joinedTake`). None
 * where nothing was said.
 */
async function sceneTakes(
  root: string,
  scenes: ReadonlyArray<CardsScene>,
  said: ReadonlyArray<StillTake | null>,
  owned: Readonly<Partial<Record<string, SpokenTakeFiles>>>
): Promise<Array<StillTake | null>> {
  const ports = nodePorts(root)
  let next = 0
  const takes: Array<StillTake | null> = []
  for (const scene of scenes) {
    // A spoken card's answer is the owner's take, played whole.
    const answer = scene.spoken?.scene.take
    if (answer !== undefined) {
      const files = owned[answer]
      takes.push(
        files === undefined
          ? null
          : await ownTake({
              own: files,
              said: scene.said,
              timed: true,
              file: scene.file,
              ports,
            })
      )
      continue
    }
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

/** The takes `essay`'s spoken cards play, from `--takes`, each as home heard it. */
async function spokenTakes(
  essay: CutList,
  dir: string | undefined
): Promise<{
  readonly owned: Readonly<Record<string, SpokenTakeFiles>>
  readonly heard: ReadonlyMap<string, HeardSpokenCard>
}> {
  const named = spokenTakesOf(essay)
  if (dir === undefined) {
    if (named.length > 0)
      fail([
        "Its spoken cards play the owner's takes: --takes names the folder home handed them in",
      ])
    return { owned: {}, heard: new Map() }
  }
  const at = here(dir)
  const files = spokenTakeFilesOf(named, await readdir(at))
  if (!files.ok)
    fail([`The takes in ${at} don't fit the essay:`, ...files.problems])
  const owned = Object.fromEntries(
    Object.entries(files.value).map(([id, take]) => [
      id,
      {
        audio: join(at, take.audio),
        words: take.words === null ? null : join(at, take.words),
        transcript: join(at, take.transcript),
      },
    ])
  )
  const transcripts = new Map<string, unknown>()
  for (const [id, take] of Object.entries(owned)) {
    const body: unknown = JSON.parse(await readFile(take.transcript, "utf8"))
    transcripts.set(id, body)
  }
  const heard = new Map<string, HeardSpokenCard>()
  const problems: Array<string> = []
  for (const { id, card } of spokenCardsOf(essay)) {
    const one = heardSpokenCard(id, card, (take) => transcripts.get(take))
    if (one.ok) heard.set(id, one.value)
    else problems.push(...one.problems)
  }
  if (problems.length > 0)
    fail(["Its spoken cards can't play these takes:", ...problems])
  return { owned, heard }
}

/**
 * A still of each spoken card's scene into `root` (`<file>.png`), from the
 * built app's `/essay?kind=spoken`, its read of each card answered from
 * `heard` alone. Refuses a scene that doesn't fit the frame.
 */
async function spokenStills(
  page: Page,
  origin: string,
  root: string,
  scenes: ReadonlyArray<CardsScene>,
  heard: ReadonlyMap<string, HeardSpokenCard>
): Promise<void> {
  await page.route(/\/spoken-cards\/[^/?#]+\.json$/, (route) => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1)
    const card = heard.get(
      decodeURIComponent(name ?? "").replace(/\.json$/, "")
    )
    return card === undefined
      ? route.fulfill({ status: 404, body: "" })
      : route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(card),
        })
  })
  const overflowing: Array<string> = []
  for (const scene of scenes) {
    if (scene.spoken === undefined) continue
    const id = scene.spoken.scene.id
    await page.goto(
      `${origin}/essay?${new URLSearchParams({
        kind: "spoken",
        week: scene.spoken.card,
        scene: id,
        record: "true",
      }).toString()}`
    )
    const shown = await shownFrame(page, `[data-scene="${id}"]`)
    await page.evaluate(async () => {
      await document.fonts.ready
    })
    if ((await shown.getAttribute("data-overflow")) === "true")
      overflowing.push(scene.id)
    await page.screenshot({
      path: join(root, `${scene.file}.png`),
      animations: "disabled",
      caret: "hide",
    })
  }
  if (overflowing.length > 0)
    fail([
      "These scenes don't fit the frame, so the video would cut them off:",
      ...overflowing,
    ])
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
  const { owned, heard } = spoken
    ? await spokenTakes(essay.value, values.takes)
    : { owned: {}, heard: new Map<string, HeardSpokenCard>() }
  const scenes = spoken ? cardsScenes(essay.value, heard) : []
  refuseLong(scenes, policy)
  const root = join(here(values.out), key)
  await mkdir(root, { recursive: true })
  await writeFile(join(root, "essay.json"), written)

  const takes = spoken
    ? await sceneTakes(
        root,
        scenes,
        await sayLines({ root, lines: cardsLines(scenes), speaker, policy }),
        owned
      )
    : []

  // The brand files the series names, from home's brand folder (`--brand`).
  const series = join(SERIES, essay.value.series.id)
  await placeBed(series, essay.value.series.version, values.brand, root)
  const site = await siteOf(values)
  const browser = await launchChromium()
  try {
    if (scenes.some((scene) => scene.spoken !== undefined)) {
      const page = await browser.newPage({
        viewport: FRAME,
        deviceScaleFactor: 1,
      })
      try {
        await spokenStills(page, site.origin, root, scenes, heard)
      } finally {
        await page.close()
      }
    }
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
