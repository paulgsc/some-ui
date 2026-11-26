/**
 * Records and renders one cards essay (CARDS7 #2979, EXPLAIN6 #3021): its
 * cut list, each scene a card or a screen of the app, drawn by the built app's burn-ins page
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
 * anything is drawn (HEARD2). Each Kokoro turn is said in the voice the
 * policy gives its place (C840) and each take played whole, under a still of the card's scene from the built
 * app's `/essay?kind=spoken` (template A). With no spoken card it takes no
 * `--takes`, and records as it always has.
 *
 * An essay may show screens of the app home keeps (SNIPS4,
 * `@some-ui/video-render`'s `snip.ts`), handed as its takes are, each kind
 * in its own folder. `--snips <dir>` (`<key>.snips/`) holds `snips.json`
 * (`some-ui.snips-given/1`), the records of the snips the essay names by
 * each bundle's commit, with
 * each picture under it by its bundle name. `--clips <dir>` (`<key>.clips/`)
 * holds each Clips Library frame it names at `<clip>/<side>/<file>`, and
 * `--pages <dir>` (`<key>.pages/`) holds `pages.json` (`some-ui.pages/1`)
 * beside each public page's picture (`./pages.ts`), and `--walks <dir>`
 * (`<key>.walks/`) holds `walks.json` (`some-ui.walks-given/1`) and each
 * walk's pictures at `<run>/<app>/snips/<NN>.png` (#3476). A screen
 * home didn't hand, a picture not the one its record names, a page taken at
 * another moment than the scene says, or a frame that isn't a PNG is
 * refused before anything is drawn. With no screen it takes none of them.
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
import { captionShare } from "@some-ui/burn-ins"
import { sha256Hex } from "@some-ui/core-utils"
import {
  cardsChapterMarks,
  cardsLines,
  cardsScenes,
  CHAPTER_GAP_MS,
  clipFramesOf,
  CLIPS_DIR,
  heardSpokenCard,
  isSpokenEssay,
  joinedTake,
  PAGES_DIR,
  pagesOf,
  parseCardsEssay,
  parsePages,
  parseSnipsGiven,
  parseWalksGiven,
  pngSize,
  resolveScreens,
  sceneNames,
  sceneTakeFile,
  SNIPS_DIR,
  snipsOf,
  spokenCardsOf,
  spokenTakeFilesOf,
  spokenTakesOf,
  voicedCardsCutList,
  walkPicturePath,
  walkPictureProblem,
  WALKS_DIR,
  walksOf,
} from "@some-ui/video-render"
import type {
  CardsScene,
  CastLayout,
  CutList,
  Handed,
  HeardSpokenCard,
  Pages,
  PictureSize,
  Series,
  SnipsGiven,
  SpokenTakeFiles,
  StillTake,
  WalksGiven,
} from "@some-ui/video-render"
import {
  layAudio,
  nodePorts,
  readSeries,
  sayLines,
} from "@some-ui/video-render/node"

import { CALL_OPTIONS, FRAME } from "./call-recording"
import { fail, here, jsonOr, launchChromium, runCommand } from "./command"
import { cardsEssayFacts } from "./thumbnail-facts"
import {
  placeBed,
  policyOf,
  recordStills,
  refuseLong,
  renderCut,
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
    clips: { type: "string" },
    pages: { type: "string" },
    walks: { type: "string" },
    ...CALL_OPTIONS,
  },
})

/**
 * Each scene's take, from `said`, its cards' lines' takes in order: a
 * spoken card's scene its own, from `spoken` by its id; a line's own
 * where it is the scene's only one, else its lines' audio joined into
 * the file the cut list plays (`sceneTakeFile`, CT1), `CHAPTER_GAP_MS`
 * of silence between (`joinedTake`). None where nothing was said.
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
    // One join of per-line takes (`layAudio`), a chapter's gap after each
    // but the last. The laid file's own length bounds the take: each line's
    // was rounded to a whole ms, so it never runs past the audio.
    const laidMs = await layAudio(
      ports,
      scene.lines.map((line, i) => ({
        file: `${line.file}.wav`,
        pad:
          i < scene.lines.length - 1
            ? { kind: "after" as const, ms: CHAPTER_GAP_MS }
            : null,
      })),
      `${sceneTakeFile(scene)}.wav`
    )
    const take = joinedTake(heard)
    takes.push({ ...take, ms: Math.min(take.ms, laidMs) })
  }
  return takes
}

/** The takes `essay`'s spoken cards play, from `--takes`, each as home heard it. */
async function spokenTakes(
  essay: CutList,
  dir: string | undefined,
  look: Pick<Series, "theme" | "cast">
): Promise<{
  readonly owned: Readonly<Record<string, SpokenTakeFiles>>
  readonly heard: ReadonlyMap<string, HeardSpokenCard>
}> {
  const named = spokenTakesOf(essay)
  // Template A is drawn in its series' theme, as the cards around it (C816),
  // with its series' cast (C822).
  const { theme, cast } = look
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
 * `heard` alone, and its take: a Kokoro turn said in its place's voice, an
 * owner's turn their own take from `owned`, played whole. Recorded as every
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
  casts,
}: {
  readonly page: Page
  readonly origin: string
  readonly root: string
  readonly scenes: ReadonlyArray<CardsScene>
  readonly heard: ReadonlyMap<string, HeardSpokenCard>
  readonly owned: Readonly<Partial<Record<string, SpokenTakeFiles>>>
  readonly speaker: string | null
  readonly policy: ReturnType<typeof policyOf>
  /** Filled with where each still draws its cast (C1546). */
  readonly casts: Map<string, CastLayout>
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
  // Each scene by its chapter and place in the whole video, said if it
  // doesn't fit (RETRY).
  const names = sceneNames(scenes, (scene) => scene.mark)
  const nameOf = new Map(scenes.map((scene, i) => [scene.id, names[i]]))
  const takes = await recordStills({
    page,
    root,
    shots: spoken.map(({ scene, spoken: { card, scene: on } }) => {
      const voice = scene.lines.at(0)?.voice
      const own = on.take === undefined ? undefined : owned[on.take]
      // `spokenTakes` refused a missing take before anything was drawn; an
      // answer is never said by the speaker in its place.
      if (on.take !== undefined && own === undefined)
        fail([`${scene.id}: home handed no take ${on.take}`])
      const name = nameOf.get(scene.id)
      return {
        id: scene.id,
        file: scene.file,
        ...(name === undefined ? {} : { name }),
        url: `${origin}/essay?${new URLSearchParams({
          kind: "spoken",
          week: card,
          scene: on.id,
          record: "true",
        }).toString()}`,
        said: scene.said,
        // A Kokoro turn's voice; an owner's turn plays their take, said in none.
        voice:
          voice ?? (own === undefined ? fail([`${scene.id}: no voice`]) : ""),
        ...(own === undefined ? {} : { own }),
      }
    }),
    frame: (id) => `[data-scene="${stage.get(id) ?? id}"]`,
    speaker,
    timed: true,
    policy,
    announce: false,
    casts,
  })
  return new Map(spoken.map(({ scene }, i) => [scene.id, takes[i] ?? null]))
}

/** What home handed for `cut`'s screens of the app, and the folders it is in. */
type HandedScreens = {
  readonly handed: Handed
  readonly snipsDir: string | null
  readonly clipsDir: string | null
  readonly pagesDir: string | null
  readonly walksDir: string | null
}

/**
 * What home handed for `cut`'s screens, checked before anything is drawn:
 * each snip's and page's picture by its record's hash, bytes and size, each
 * clip frame a PNG, and every screen the essay names among them
 * (`resolveScreens`). Null when it names none.
 */
async function handedScreens(
  cut: CutList,
  snipsFlag: string | undefined,
  clipsFlag: string | undefined,
  pagesFlag: string | undefined,
  walksFlag: string | undefined
): Promise<HandedScreens | null> {
  const snips = snipsOf(cut)
  const clips = clipFramesOf(cut)
  const pages = pagesOf(cut)
  const walks = walksOf(cut)
  if (
    snips.length === 0 &&
    clips.length === 0 &&
    pages.length === 0 &&
    walks.length === 0
  )
    return null
  const problems: Array<string> = []
  if (snips.length > 0 && snipsFlag === undefined)
    problems.push(
      `it shows ${String(snips.length)} snips, and --snips names no folder home handed them in`
    )
  if (clips.length > 0 && clipsFlag === undefined)
    problems.push(
      `it shows ${String(clips.length)} clip frames, and --clips names no folder home handed them in`
    )
  if (pages.length > 0 && pagesFlag === undefined)
    problems.push(
      `it shows ${String(pages.length)} pages, and --pages names no folder home handed them in`
    )
  if (walks.length > 0 && walksFlag === undefined)
    problems.push(
      `it plays ${String(walks.length)} walks, and --walks names no folder home handed them in`
    )
  if (problems.length > 0) fail(problems)
  const snipsDir = snipsFlag === undefined ? null : here(snipsFlag)
  const walksDir = walksFlag === undefined ? null : here(walksFlag)
  const pagesDir = pagesFlag === undefined ? null : here(pagesFlag)
  const clipsDir = clipsFlag === undefined ? null : here(clipsFlag)
  let given: SnipsGiven | null = null
  if (snipsDir !== null) {
    const read = await readFile(join(snipsDir, "snips.json"), "utf8").catch(
      () => fail([`${snipsDir} holds no snips.json`])
    )
    const parsed = parseSnipsGiven(jsonOr(read, `${snipsDir}/snips.json`))
    if (!parsed.ok) fail([`${snipsDir}/snips.json:`, ...parsed.problems])
    given = parsed.value
    for (const snip of given.bundles.flatMap((bundle) => bundle.snips)) {
      const bytes = await readFile(join(snipsDir, snip.image.name)).catch(
        () => null
      )
      if (bytes === null)
        problems.push(`${snip.id}: ${snip.image.name} is missing`)
      else if (
        bytes.length !== snip.image.bytes ||
        (await sha256Hex(new Uint8Array(bytes).buffer)) !== snip.image.sha256
      )
        problems.push(
          `${snip.id}: ${snip.image.name} is not the picture its record names`
        )
      else {
        // A record of another size would zoom to the wrong boxes.
        const size = pngSize(bytes)
        if (size?.width !== snip.width || size.height !== snip.height)
          problems.push(
            `${snip.id}: ${snip.image.name} isn't the size its record says`
          )
      }
    }
  }
  const frames = new Map<string, PictureSize>()
  if (clipsDir !== null)
    for (const frame of clips) {
      const bytes = await readFile(join(clipsDir, frame)).catch(() => null)
      if (bytes === null) continue // resolveScreens says it wasn't handed
      const size = pngSize(bytes)
      if (size === null)
        problems.push(`${frame}: home handed a frame that isn't a PNG`)
      else frames.set(frame, size)
    }
  let taken: Pages | null = null
  if (pagesDir !== null) {
    const read = await readFile(join(pagesDir, "pages.json"), "utf8").catch(
      () => fail([`${pagesDir} holds no pages.json`])
    )
    const parsed = parsePages(jsonOr(read, `${pagesDir}/pages.json`))
    if (!parsed.ok) fail([`${pagesDir}/pages.json:`, ...parsed.problems])
    taken = parsed.value
    for (const page of taken.pages) {
      const { name } = page.image
      const bytes = await readFile(join(pagesDir, name)).catch(() => null)
      if (bytes === null) problems.push(`${name} is missing`)
      else if (
        bytes.length !== page.image.bytes ||
        (await sha256Hex(new Uint8Array(bytes).buffer)) !== page.image.sha256
      )
        problems.push(`${name} is not the picture its record names`)
      else {
        const size = pngSize(bytes)
        if (size?.width !== page.width || size.height !== page.height)
          problems.push(`${name} isn't the size its record says`)
      }
    }
  }
  let walked: WalksGiven | null = null
  if (walksDir !== null) {
    const read = await readFile(join(walksDir, "walks.json"), "utf8").catch(
      () => fail([`${walksDir} holds no walks.json`])
    )
    const parsed = parseWalksGiven(jsonOr(read, `${walksDir}/walks.json`))
    if (!parsed.ok) fail([`${walksDir}/walks.json:`, ...parsed.problems])
    walked = parsed.value
    for (const { run, walks: given } of walked.runs)
      for (const { walk, pictures } of given)
        for (const picture of pictures) {
          const path = walkPicturePath(run, picture.name)
          const bytes = await readFile(join(walksDir, path)).catch(() => null)
          if (bytes === null) problems.push(`${path} is missing`)
          else if (
            bytes.length !== picture.bytes ||
            (await sha256Hex(new Uint8Array(bytes).buffer)) !== picture.sha256
          )
            problems.push(`${path} is not the picture its record names`)
          else {
            // One that isn't a PNG draws nothing; one its walk's screen
            // can't hold is drawn off its taps or cut off (#3499).
            const size = pngSize(bytes)
            const wrong = size === null ? null : walkPictureProblem(walk, size)
            if (size === null) problems.push(`${path} isn't a PNG`)
            else if (wrong !== null) problems.push(`${path} ${wrong}`)
          }
        }
  }
  if (problems.length > 0) fail(problems)
  const handed = { snips: given, clips: frames, pages: taken, walks: walked }
  const resolved = resolveScreens(cut, handed)
  if (!resolved.ok) fail(resolved.problems)
  return { handed, snipsDir, clipsDir, pagesDir, walksDir }
}

/**
 * `cut` with its screens of the app drawn from what home handed, the
 * snips' pictures copied into `root/snips/` and the frames into `root/clips/`:
 * in a `spoken` essay, each held above the band the captions draw in, so a
 * caption is never over the app's own screen (C869), and each drawn in
 * `series`' own ground and theme, among its cards (C818). A silent essay
 * has no captions and keeps the whole frame.
 */
async function withScreens(
  cut: CutList,
  screens: HandedScreens | null,
  { frame, theme, ground }: Series,
  spoken: boolean,
  root: string
): Promise<CutList> {
  if (screens === null) return cut
  const copies = [
    ...(screens.snipsDir === null
      ? []
      : (screens.handed.snips?.bundles ?? [])
          .flatMap((bundle) => bundle.snips)
          .map((snip) => ({
            from: join(screens.snipsDir ?? "", snip.image.name),
            to: join(root, SNIPS_DIR, snip.image.name),
          }))),
    ...(screens.clipsDir === null
      ? []
      : [...(screens.handed.clips?.keys() ?? [])].map((frame) => ({
          from: join(screens.clipsDir ?? "", frame),
          to: join(root, CLIPS_DIR, frame),
        }))),
    ...(screens.pagesDir === null
      ? []
      : (screens.handed.pages?.pages ?? []).map(({ image }) => ({
          from: join(screens.pagesDir ?? "", image.name),
          to: join(root, PAGES_DIR, image.name),
        }))),
    ...(screens.walksDir === null
      ? []
      : (screens.handed.walks?.runs ?? []).flatMap(({ run, walks }) =>
          walks.flatMap(({ pictures }) =>
            pictures.map(({ name }) => ({
              from: join(screens.walksDir ?? "", walkPicturePath(run, name)),
              to: join(root, WALKS_DIR, walkPicturePath(run, name)),
            }))
          )
        )),
  ]
  for (const { from, to } of copies) {
    await mkdir(dirname(to), { recursive: true })
    await copyFile(from, to)
  }
  const resolved = resolveScreens(cut, screens.handed, {
    foot: spoken ? captionShare(frame) : 0,
    ground,
    ...(theme === undefined ? {} : { theme }),
  })
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
  const { id: seriesId, version } = essay.value.series
  const read = await readSeries(join(SERIES, seriesId), version)
  if (!read.ok)
    fail([`${seriesId} v${String(version)} can't be read:`, ...read.problems])
  const { owned, heard } = spoken
    ? await spokenTakes(essay.value, values.takes, read.value)
    : { owned: {}, heard: new Map<string, HeardSpokenCard>() }
  const scenes = spoken
    ? cardsScenes(essay.value, heard, read.value.voices)
    : []
  refuseLong(scenes, policy)
  const screens = await handedScreens(
    essay.value,
    values.snips,
    values.clips,
    values.pages,
    values.walks
  )
  const root = join(here(values.out), key)
  await mkdir(root, { recursive: true })
  await writeFile(join(root, "essay.json"), written)

  // The brand files the series names, from home's brand folder (`--brand`).
  const series = join(SERIES, seriesId)
  await placeBed(series, version, values.brand, root)
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
      ? await sayLines({
          root,
          ports: nodePorts(root),
          lines,
          speaker,
          policy,
          announce: false,
        })
      : []
    let recorded: ReadonlyMap<string, StillTake | null> = new Map()
    const casts = new Map<string, CastLayout>()
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
          casts,
        })
      } finally {
        await page.close()
      }
    }
    const takes = spoken ? await sceneTakes(root, scenes, said, recorded) : []
    await renderCut(
      root,
      series,
      await withScreens(
        spoken
          ? voicedCardsCutList(essay.value, scenes, takes, casts)
          : essay.value,
        screens,
        read.value,
        spoken,
        root
      ),
      {
        preview: false,
        episode: "cards.mp4",
        thumbnail: cardsEssayFacts(essay.value),
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
