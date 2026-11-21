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
 * An essay may show screens of the app from the snip library (SNIPS4,
 * `@some-ui/video-render`'s `snip.ts`). Then `--snips <dir>` is the folder
 * home hands over: `snips.json` (`some-ui.snips-given/1`), the records of
 * the snips the essay names, with each picture under it by its bundle name.
 * A snip home didn't hand, or a picture not the one its record names, is
 * refused before anything is drawn. With no snip it takes no `--snips`.
 *
 * It takes the flags every home recorder takes (`CALL_OPTIONS`). Policy, the
 * step cache (which keeps each take by its words, voice and model) and
 * `--brand` are the call's (`./call` says how). Needs `ffmpeg` and `ffprobe`
 * on `PATH`.
 */

import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { parseArgs } from "node:util"
import type { Page } from "@playwright/test"
import { sha256Hex } from "@some-ui/core-utils"
import {
  cardsChapterMarks,
  cardsLines,
  cardsScenes,
  CHAPTER_GAP_MS,
  heardSpokenCard,
  isSpokenEssay,
  joinedTake,
  parseCardsEssay,
  parseSnipsGiven,
  QUIET,
  resolveSnips,
  snipIdsOf,
  SPOKEN_ASKER_VOICE,
  spokenCardsOf,
  spokenTakeFilesOf,
  spokenTakesOf,
  voicedCardsCutList,
} from "@some-ui/video-render"
import type {
  CardsScene,
  CutList,
  HeardSpokenCard,
  SnipsGiven,
  SpokenTakeFiles,
  StillTake,
} from "@some-ui/video-render"
import { nodePorts, readSeries } from "@some-ui/video-render/node"

import { CALL_OPTIONS, FRAME } from "./call-recording"
import { fail, here, launchChromium, runCommand } from "./command"
import {
  placeBed,
  policyOf,
  recordStills,
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
    takes: { type: "string" },
    snips: { type: "string" },
    ...CALL_OPTIONS,
  },
})

/**
 * Each scene's take, from `said`, its cards' lines' takes in order: a
 * spoken card's scene its own, from `spoken` by its id; a line's own
 * where it is the scene's only one, else its lines' audio joined into
 * `<file>.wav`, `CHAPTER_GAP_MS` of silence between (`joinedTake`). None
 * where nothing was said.
 */
async function sceneTakes(
  root: string,
  scenes: ReadonlyArray<CardsScene>,
  said: ReadonlyArray<StillTake | null>,
  spoken: ReadonlyMap<string, StillTake | null>
): Promise<Array<StillTake | null>> {
  const ports = nodePorts(root)
  let next = 0
  const takes: Array<StillTake | null> = []
  for (const scene of scenes) {
    // A spoken card's scene was recorded with its still (`spokenStills`).
    if (scene.spoken !== undefined) {
      takes.push(spoken.get(scene.id) ?? null)
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
  // Template A is drawn in its series' theme, as the cards around it (C816),
  // with its series' cast (C822).
  const { id: seriesId, version } = essay.series
  const read = await readSeries(join(SERIES, seriesId), version)
  if (!read.ok)
    fail([`${seriesId} v${String(version)} can't be read:`, ...read.problems])
  const { theme, cast } = read.value
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
    const text = await readFile(take.transcript, "utf8")
    try {
      const body: unknown = JSON.parse(text)
      transcripts.set(id, body)
    } catch {
      fail([`${take.transcript} isn't a transcript home wrote: it isn't JSON`])
    }
  }
  const heard = new Map<string, HeardSpokenCard>()
  const problems: Array<string> = []
  for (const { id, card } of spokenCardsOf(essay)) {
    const one = heardSpokenCard(id, card, (take) => transcripts.get(take), {
      theme,
      cast,
    })
    if (one.ok) heard.set(id, one.value)
    else problems.push(...one.problems)
  }
  if (problems.length > 0)
    fail(["Its spoken cards can't play these takes:", ...problems])
  return { owned, heard }
}

/**
 * A still of each spoken card's scene into `root` (`<file>.png`) from the
 * built app's `/essay?kind=spoken`, its read of each card answered from
 * `heard` alone, and its take: a question said in the asker's voice, an
 * answer the owner's own take from `owned`, played whole. Recorded as every
 * voiced stage's are (`recordStills`), by each scene's id.
 */
async function spokenStills({
  page,
  origin,
  root,
  scenes,
  heard,
  owned,
  speaker,
  policy,
}: {
  readonly page: Page
  readonly origin: string
  readonly root: string
  readonly scenes: ReadonlyArray<CardsScene>
  readonly heard: ReadonlyMap<string, HeardSpokenCard>
  readonly owned: Readonly<Partial<Record<string, SpokenTakeFiles>>>
  readonly speaker: string | null
  readonly policy: ReturnType<typeof policyOf>
}): Promise<ReadonlyMap<string, StillTake | null>> {
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
  const spoken = scenes.flatMap((scene) =>
    scene.spoken === undefined ? [] : [{ scene, spoken: scene.spoken }]
  )
  const stage = new Map(spoken.map((s) => [s.scene.id, s.spoken.scene.id]))
  const takes = await recordStills({
    page,
    root,
    shots: spoken.map(({ scene, spoken: { card, scene: on } }) => {
      const own = on.take === undefined ? undefined : owned[on.take]
      // `spokenTakes` refused a missing take before anything was drawn; an
      // answer is never said by the speaker in its place.
      if (on.take !== undefined && own === undefined)
        fail([`${scene.id}: home handed no take ${on.take}`])
      return {
        id: scene.id,
        file: scene.file,
        url: `${origin}/essay?${new URLSearchParams({
          kind: "spoken",
          week: card,
          scene: on.id,
          record: "true",
        }).toString()}`,
        said: scene.said,
        voice: SPOKEN_ASKER_VOICE,
        ...(own === undefined ? {} : { own }),
      }
    }),
    frame: (id) => `[data-scene="${stage.get(id) ?? id}"]`,
    speaker,
    timed: true,
    policy,
    announce: false,
  })
  return new Map(spoken.map(({ scene }, i) => [scene.id, takes[i] ?? null]))
}

/** The snips home handed in `dir` for `cut`, checked; null when it names none. */
async function snipsGiven(
  cut: CutList,
  dir: string | undefined
): Promise<{ readonly dir: string; readonly given: SnipsGiven } | null> {
  const named = snipIdsOf(cut)
  if (named.length === 0) return null
  if (dir === undefined)
    fail([
      `it shows ${String(named.length)} snips, and --snips names no folder home handed them in`,
    ])
  const from = here(dir)
  const read = await readFile(join(from, "snips.json"), "utf8").catch(() =>
    fail([`${dir} holds no snips.json`])
  )
  const given = parseSnipsGiven(JSON.parse(read))
  if (!given.ok) fail([`${dir}/snips.json:`, ...given.problems])
  const problems: Array<string> = []
  for (const snip of given.value.snips) {
    const bytes = await readFile(join(from, snip.image.name)).catch(() => null)
    if (bytes === null)
      problems.push(`${snip.id}: ${snip.image.name} is missing`)
    else if (
      (await sha256Hex(new Uint8Array(bytes).buffer)) !== snip.image.sha256
    )
      problems.push(
        `${snip.id}: ${snip.image.name} is not the picture its record names`
      )
  }
  if (problems.length > 0) fail(problems)
  // A snip it names that home didn't hand is refused here, before anything is drawn.
  const resolved = resolveSnips(cut, given.value)
  if (!resolved.ok) fail(resolved.problems)
  return { dir: from, given: given.value }
}

/** `cut` with its snip scenes drawn from `snips`, their pictures copied into `root/snips/`. */
async function withSnips(
  cut: CutList,
  snips: { readonly dir: string; readonly given: SnipsGiven } | null,
  root: string
): Promise<CutList> {
  if (snips === null) return cut
  for (const snip of snips.given.snips) {
    const to = join(root, "snips", snip.image.name)
    await mkdir(dirname(to), { recursive: true })
    await copyFile(join(snips.dir, snip.image.name), to)
  }
  const resolved = resolveSnips(cut, snips.given)
  if (!resolved.ok) return fail(resolved.problems)
  return resolved.value
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
  const given = await snipsGiven(essay.value, values.snips)
  const root = join(here(values.out), key)
  await mkdir(root, { recursive: true })
  await writeFile(join(root, "essay.json"), written)

  // The brand files the series names, from home's brand folder (`--brand`).
  const series = join(SERIES, essay.value.series.id)
  await placeBed(series, essay.value.series.version, values.brand, root)
  const site = await siteOf(values)
  const browser = await launchChromium()
  try {
    // Home's board counts every take and still once (#2899): the cards'
    // lines, then each spoken card's scene.
    const cards = scenes.filter((scene) => scene.spoken === undefined)
    const lines = cardsLines(cards)
    const spokenCount = scenes.length - cards.length
    if (spoken) console.log(`scenes ${String(lines.length + spokenCount)}`)
    const said = spoken
      ? await sayLines({ root, lines, speaker, policy, announce: false })
      : []
    let recorded: ReadonlyMap<string, StillTake | null> = new Map()
    if (spokenCount > 0) {
      const page = await browser.newPage({
        viewport: FRAME,
        deviceScaleFactor: 1,
      })
      try {
        recorded = await spokenStills({
          page,
          origin: site.origin,
          root,
          scenes,
          heard,
          owned,
          speaker,
          policy,
        })
      } finally {
        await page.close()
      }
    }
    const takes = spoken ? await sceneTakes(root, scenes, said, recorded) : []
    await renderCut(
      root,
      series,
      await withSnips(
        spoken ? voicedCardsCutList(essay.value, scenes, takes) : essay.value,
        given,
        root
      ),
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
