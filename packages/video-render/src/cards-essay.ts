/**
 * A cards essay (CARDS7, #2979): a video of cards, each claim stamped with
 * the commits it was checked against, that home renders as it renders the
 * weekly call. A session writes the cut list; everything after it is code.
 * `paulgsc/testing` keeps each as `cards/<key>.json`, listed in
 * `cards/index.json` (C327), and home reads that index hourly
 * (`CARDS-ROUTINE.md`).
 *
 * The file is the cut list itself, as `sample/videos/<video>/cut-list.json`
 * is. Its key is a slug and its stamp's day (`nixos-upgrade-2026-11-14`),
 * so the same subject checked again on a later day is a new essay. Home has
 * no captures or takes for one: every scene is a card picture, or a screen
 * of the app home keeps, a snip or a clip frame (SNIPS4, `./snip`), which
 * home hands beside the essay.
 *
 * From the cheat-sheet series' version 2 an essay is spoken (EXPLAIN6,
 * #3021, C370, C371: `Spoken`); one in version 1 is silent. A spoken essay
 * may hold spoken cards (WALK7, C810: `spoken-card.ts`), the owner's own
 * takes from home in their category's template; then home hands the takes
 * it names beside it.
 */

import { z } from "zod"

import { bookendProblems, bookendsOf, isSeriesId } from "./bookends"
import { CALL_VOICES } from "./call"
import type { ChapterMark } from "./chapters"
import { withoutStop } from "./chapters"
import type { ReadFile, SourceCheck } from "./claims"
import { sourceProblems, unpinnedSources } from "./claims"
import type { CutList, Parsed, Shot, SpokenTurn, TimedWord } from "./cut-list"
import { isCaptions, isComposition, parseCutList, problemsOf } from "./cut-list"
import { ESSAY_VOICES } from "./essay"
import { resolve } from "./resolve"
import type { Series } from "./series"
import { withSeries } from "./series"
import { unshownProblems } from "./shown"
import type { HeardSpokenCard, HeardTurn, SpokenScene } from "./spoken-card"
import { spokenCardProblems, spokenScenes } from "./spoken-card"
import {
  SPOKEN_CATEGORY_OPENS,
  SPOKEN_CATEGORY_TITLES,
} from "./spoken-categories"
import { estimatedMs, heldFor, stillFile } from "./stills"
import type { StillScene, StillTake } from "./stills"
import { TRANSITION_MS } from "./vocabulary"
import type { Transition } from "./vocabulary"
import { chapterIndexes, voicePolicyOf, voicesInChapters } from "./voices"
import type { KokoroVoice, VoiceRole, VoicesId } from "./voices"

export const CARDS_INDEX_SCHEMA = "some-ui.cards-index/1"

/** The series a cards essay may be drawn in. */
export const CARDS_SERIES: ReadonlySet<string> = new Set(["cheat-sheet"])

/** The first version of a cards series whose essays are spoken (C371). */
export const CARDS_SPOKEN_VERSION = 2

/**
 * The first version of a cards series that plays spoken cards (WALK7,
 * C811): its window is the whole frame, so a spoken card's still, drawn by
 * its stage, fills it as the call's do. A cards essay before it has no
 * still to place, so the window changes nothing drawn in an older version.
 */
export const CARDS_SPOKEN_CARD_VERSION = 3

/** Whether `cut` is a spoken essay: drawn in a version that is (C371). */
export const isSpokenEssay = (cut: CutList): boolean =>
  cut.series.version >= CARDS_SPOKEN_VERSION

/**
 * Who says a spoken essay's lines: the host says the intro, each chapter
 * line and the close; the narrator teaches each card; and in a spoken card,
 * Kokoro asks (`asker`) or answers (`tutor`) the owner, as its bubble is
 * drawn (`TURN_SPEAKER`: a tin sparrow asks, a tin owlet answers).
 */
export type CardsSpeaker = "host" | "narrator" | "asker" | "tutor"

/**
 * Each speaker's Kokoro voice in a series with no voice lanes, the cards
 * essay's `fixed` case of the voice policy (C840): the host, the weekly
 * call's (C372), and the narrator, one for every card; and Kokoro in a spoken card, asking or answering, the
 * essays' asker's. The voice changing is how a listener hears a new chapter
 * begin.
 */
export const CARDS_VOICES: Readonly<Record<CardsSpeaker, KokoroVoice>> = {
  host: CALL_VOICES.intro,
  narrator: CALL_VOICES.moved,
  asker: ESSAY_VOICES.asker,
  tutor: ESSAY_VOICES.asker,
}

/** The role each speaker plays in the voice lanes: its own (C840). */
export const CARDS_VOICE_ROLES: Readonly<Record<CardsSpeaker, VoiceRole>> = {
  host: "host",
  narrator: "narrator",
  asker: "asker",
  tutor: "tutor",
}

/**
 * The longest a spoken essay runs, by its words: the weekly call's part,
 * twelve minutes, the owner's bound for the diagnosis essay ("at most 12
 * minutes", #3476), as policy that moves with the story (C1426, which moves
 * C373's ten). A longer subject is two essays.
 */
export const CARDS_MOST_MS = 720_000

/** A slug, then the stamp's day: `<slug>-<YYYY-MM-DD>`. */
export const CARDS_KEY = /^[a-z0-9]+(-[a-z0-9]+)*-(\d{4}-\d{2}-\d{2})$/

const KeySchema = z.string().regex(CARDS_KEY, "it isn't <slug>-<YYYY-MM-DD>")

/** The essays `cards/` holds, newest first, each `<key>.json` beside it. */
export const CardsIndexSchema = z
  .strictObject({
    schema: z.literal(CARDS_INDEX_SCHEMA),
    essays: z.array(z.strictObject({ key: KeySchema })),
  })
  .refine(
    (index) =>
      index.essays.every(
        (e, i) => i === 0 || dayOf(e.key) <= dayOf(index.essays[i - 1]?.key)
      ) && new Set(index.essays.map((e) => e.key)).size === index.essays.length,
    { message: "its essays aren't newest first, each once", path: ["essays"] }
  )

export type CardsIndex = z.infer<typeof CardsIndexSchema>

function dayOf(key: string | undefined): string {
  return CARDS_KEY.exec(key ?? "")?.[2] ?? ""
}

export function parseCardsIndex(raw: unknown): Parsed<CardsIndex> {
  const parsed = CardsIndexSchema.safeParse(raw)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, problems: problemsOf(parsed.error, "cards index") }
}

/**
 * The cut list `raw` as the essay `key`, or every reason home can't render
 * it: what any cut list is refused for (`parseCutList`), a key that isn't
 * its stamp's day, a line citing a repository its stamp doesn't pin
 * (`claims.ts`), a series that isn't a cards series, a scene that is
 * neither a card nor a screen of the app (`./snip`), a spoken card that
 * shows a screen, a scene that plays a take or a cue or stands on an image,
 * and captions; in a
 * spoken version, what `spokenProblems` finds, and in a silent one, a scene
 * that says something. What
 * only drawing finds (a line that doesn't fit, a character the font lacks)
 * is refused when it is recorded (`record:cards`).
 */
export function parseCardsEssay(key: string, raw: unknown): Parsed<CutList> {
  if (!CARDS_KEY.test(key))
    return { ok: false, problems: [`${key}: it isn't <slug>-<YYYY-MM-DD>`] }
  const cut = parseCutList(raw)
  if (!cut.ok) return cut
  const { series, stamp, shots } = cut.value
  const problems = [
    ...(stamp === undefined
      ? ["it has no stamp: a cards essay says what it was checked against"]
      : stamp.date === dayOf(key)
        ? []
        : [`its stamp is dated ${stamp.date}, and its key ${dayOf(key)}`]),
    ...unpinnedSources(cut.value),
    ...(CARDS_SERIES.has(series.id)
      ? []
      : [
          `it is drawn in ${series.id}, and an essay is drawn in ${[...CARDS_SERIES].join(" or ")}`,
        ]),
    ...shots
      .filter((s) => s.take !== undefined)
      .map(
        (s) =>
          `${s.id}: it plays a take, and home has none: a spoken essay's are said from its words`
      ),
    ...shots
      .filter((s) => s.overrides.background?.kind === "image")
      .map(
        (s) => `${s.id}: its background is an image, which home doesn't have`
      ),
    ...shots
      .filter((s) => (s.overrides.cues ?? []).length > 0)
      .map(
        (s) => `${s.id}: it plays cues, and a cards essay plays only its voice`
      ),
    ...(cut.value.burnIns.some(isCaptions)
      ? [
          "it asks for captions, which the recorder draws for a spoken essay from what is said",
        ]
      : []),
    ...shots
      .filter((s) => s.picture.kind === "screen" && s.spoken?.role === "spoken")
      .map(
        (s) =>
          `${s.id}: a spoken card is drawn by its stage, so it shows no screen of the app`
      ),
    ...shots
      .filter((s) => s.spoken?.role === "walk")
      .map(
        (s) =>
          `${s.id}: it narrates a walkthrough's stop: an essay plays a walk as a screen scene (from: "walks")`
      ),
    ...shots
      .filter((s) => s.picture.kind !== "card" && s.picture.kind !== "screen")
      .map(
        (s) =>
          `${s.id}: its picture is a ${s.picture.kind}, not a card or a screen of the app`
      ),
    ...(isSpokenEssay(cut.value)
      ? spokenProblems(cut.value)
      : shots
          .filter((s) => s.spoken !== undefined)
          .map(
            (s) =>
              `${s.id}: it says something, and ${series.id} v${series.version} is silent: a spoken essay pins version ${CARDS_SPOKEN_VERSION}`
          )),
  ]
  return problems.length > 0 ? { ok: false, problems } : cut
}

/** Whether `spoken` is a spoken card that opens its essay (C814). */
const opens = (spoken: Shot["spoken"]): boolean =>
  spoken?.role === "spoken" && SPOKEN_CATEGORY_OPENS[spoken.category]

/** Whether `cut` opens on the owner's spoken introduction (C814). */
const opensIntroduced = (cut: CutList): boolean => opens(cut.shots[0]?.spoken)

/**
 * Every reason a spoken essay can't be said: a scene that says nothing, no
 * intro first (after the owner's spoken introduction, where the essay opens
 * on one: C814), an intro, an introduction or a close out of place, no scene that teaches,
 * and words that run past `CARDS_MOST_MS`.
 * Whether each line is one the speaker can say is the cut list's own
 * (`SayableSchema`).
 */
function spokenProblems(cut: CutList): Array<string> {
  const { shots } = cut
  const last = shots.length - 1
  const problems: Array<string> = []
  // C814: the owner's spoken introduction opens the essay, before the intro.
  const introduced = opensIntroduced(cut)
  const intro = introduced ? 1 : 0
  if (shots[intro]?.spoken?.role !== "intro")
    problems.push(
      introduced
        ? "it has no intro after the owner's introduction: its second scene's role is intro, saying why you'd reach for this and what you'll be able to do"
        : "it has no intro: its first scene's role is intro, saying why you'd reach for this and what you'll be able to do"
    )
  if (!shots.some((s) => s.spoken?.role === "scene"))
    problems.push(
      "it has no scene that teaches a card: a chapter line, then its narration"
    )
  // C1027: a scene without a chapter line goes on in the chapter before it,
  // so one must have opened.
  const opened = shots.findIndex(
    (s) => s.spoken?.role === "scene" && s.spoken.chapter !== undefined
  )
  shots.forEach((s, i) => {
    if (
      s.spoken?.role === "scene" &&
      s.spoken.chapter === undefined &&
      (opened === -1 || i < opened)
    )
      problems.push(
        `${s.id}: it has no chapter line, and no scene before it opened a chapter: a chapter's first scene says its chapter line`
      )
    if (s.spoken?.role === "spoken")
      problems.push(
        ...(cut.series.version < CARDS_SPOKEN_CARD_VERSION
          ? [
              `${s.id}: a spoken card plays from version ${CARDS_SPOKEN_CARD_VERSION} of ${cut.series.id}, and this essay pins ${cut.series.version}`,
            ]
          : []),
        ...spokenCardProblems(s, s.spoken)
      )
    const role = s.spoken?.role
    if (role === undefined)
      problems.push(
        `${s.id}: it says nothing, and every scene of a spoken essay has its narration, and a chapter's first scene its chapter line`
      )
    if (role === "intro" && i !== intro)
      problems.push(
        introduced
          ? `${s.id}: only the scene after the owner's introduction is the intro`
          : `${s.id}: only the first scene is the intro`
      )
    if (opens(s.spoken) && i !== 0)
      problems.push(
        `${s.id}: an introduction opens the essay, so only the first scene is one`
      )
    if (role === "close" && i !== last)
      problems.push(`${s.id}: only the last scene is the close`)
  })
  // A spoken card's scenes take ids of their own: none may be another's.
  const ids = new Set(shots.map((s) => s.id))
  for (const scene of cardsScenes(cut))
    if (scene.spoken !== undefined && ids.has(scene.id))
      problems.push(
        `${scene.id}: the spoken card ${scene.spoken.card} plays a scene by this id, and another scene has it`
      )
  const ms = estimatedCardsMs(cut)
  if (ms > CARDS_MOST_MS)
    problems.push(
      `it runs about ${Math.ceil(ms / 60_000)} minutes by its words, and a spoken essay runs at most ${CARDS_MOST_MS / 60_000}: split it into two essays`
    )
  return problems
}

/** A take to ask home's speaker for: into `<file>.wav`, said in `voice`. */
export type CardsLine = {
  readonly file: string
  readonly said: string
  readonly voice: KokoroVoice
}

/** A line before its voice is chosen: who says it. */
type SpokenLine = Omit<CardsLine, "voice"> & { readonly speaker: CardsSpeaker }

/**
 * A scene of a spoken essay as the renderer draws it: the essay's scene
 * (`shot`), its files' name and all it says (`StillScene`), the takes it is
 * said in, one after another, and the chapter it opens, for the upload's
 * chapter marks. A spoken card's scene (`spoken`) is drawn by its stage, a
 * still, and its answer is the owner's take, said in no line.
 */
export type CardsScene = StillScene & {
  readonly shot: Shot
  readonly lines: ReadonlyArray<CardsLine>
  readonly mark?: string
  readonly spoken?: { readonly card: string; readonly scene: SpokenScene }
}

/** A scene before its lines' voices are chosen. */
type UnvoicedScene = Omit<CardsScene, "lines"> & {
  readonly lines: ReadonlyArray<SpokenLine>
}

/** The title of the close's chapter mark. */
export const CLOSE_MARK = "What to do next"

/** The pause between a scene's chapter line and its narration. */
export const CHAPTER_GAP_MS = 500

/** A chapter line as a title: "Chapter two. By hand." is "By hand". */
const chapterTitle = (chapter: string): string =>
  withoutStop(chapter.replace(/^chapter\s+[\w-]+\s*[.:,]\s*/i, ""))

/** A turn before its take is read: an owner's says nothing yet. */
const unheard = (turn: SpokenTurn): HeardTurn =>
  turn.voice === "kokoro" ? turn : { ...turn, transcript: "" }

/** Who says a spoken card's Kokoro turn, by its place in the exchange. */
const KOKORO_SPEAKER = {
  ask: "asker",
  answer: "tutor",
} as const satisfies Readonly<Record<SpokenScene["role"], CardsSpeaker>>

/**
 * A spoken card's scenes from its `n`th scene on: each exchange's question,
 * then its answer, each in its voice: Kokoro's line said by the asker or the
 * tutor, the owner's take in no line. `heard` is the card as home heard
 * its takes; without it (an estimate before the takes are read) an owner's
 * turn says nothing yet.
 */
function spokenCardScenes(
  shot: Shot & { readonly spoken: { readonly role: "spoken" } },
  n: number,
  heard: HeardSpokenCard | undefined
): Array<UnvoicedScene> {
  const card = heard ?? {
    category: shot.spoken.category,
    exchanges: shot.spoken.exchanges.map(({ ask, answer }) => ({
      ask: unheard(ask),
      answer: unheard(answer),
    })),
  }
  return spokenScenes(card).map((scene, j) => {
    const id = `${shot.id}-${scene.id}`
    const file = stillFile(n + j, id)
    const speaker = KOKORO_SPEAKER[scene.role]
    return {
      id,
      file,
      shot,
      said: scene.said,
      lines:
        scene.take === undefined ? [{ file, said: scene.said, speaker }] : [],
      spoken: { card: shot.id, scene },
      ...(j === 0 && opens(shot.spoken)
        ? { mark: SPOKEN_CATEGORY_TITLES[card.category] }
        : {}),
    }
  })
}

/**
 * What a spoken essay says, scene by scene: the intro, each scene's chapter
 * line in the host's voice then its narration in the narrator's, and the
 * close. A chapter of several scenes says its line and takes its mark at
 * its first scene only; the rest say their narration alone (C1027). A
 * scene's two lines are two takes (C371), joined into one (`joinedTake`),
 * so the card is drawn once, under both. A spoken card is a
 * scene for each question and each answer (`spokenCardScenes`), with the
 * card as home heard it from `heard`, by its shot's id. A scene with
 * nothing to say (which `parseCardsEssay` refuses) is left out.
 *
 * Each line's voice is its speaker's under the series' voice lanes
 * (`voices`, `Series.voices`; C840), else `CARDS_VOICES`: a scene with a
 * chapter mark opens a new chapter, so the narrator's voice moves on with
 * each card, and each of Kokoro's roles in a spoken card (asking, answering)
 * keeps one voice through its chapter: a `questions` card, which opens none,
 * plays in the chapter before it (C831).
 */
export function cardsScenes(
  cut: CutList,
  heard: ReadonlyMap<string, HeardSpokenCard> = new Map(),
  voices?: VoicesId
): Array<CardsScene> {
  const scenes: Array<UnvoicedScene> = []
  for (const shot of cut.shots) {
    const spoken = shot.spoken
    if (spoken?.role === "spoken")
      scenes.push(
        ...spokenCardScenes(
          { ...shot, spoken },
          scenes.length,
          heard.get(shot.id)
        )
      )
    else if (spoken !== undefined) scenes.push(cardScene(shot, scenes.length))
  }
  return voiced(scenes, voices)
}

/**
 * `scenes` with each line in its speaker's voice for its chapter, and each
 * spoken card's scene with Kokoro's: a scene with a chapter mark opens one.
 */
function voiced(
  scenes: ReadonlyArray<UnvoicedScene>,
  voices: VoicesId | undefined
): Array<CardsScene> {
  const policy = voicePolicyOf(voices, CARDS_VOICES, CARDS_VOICE_ROLES)
  // A spoken card's owner turn says no line, so it is no speaker's turn: a
  // role moves on only in the chapters Kokoro speaks in it.
  const chapters = chapterIndexes(
    scenes.map((scene) => scene.mark !== undefined)
  )
  const sayIn = voicesInChapters(
    policy,
    scenes.flatMap((scene, i) =>
      scene.lines.map((line) => ({
        speaker: line.speaker,
        chapter: chapters[i] ?? 0,
      }))
    )
  )
  let at = 0
  return scenes.map(({ lines, ...rest }) => ({
    ...rest,
    lines: lines.map(({ speaker: _speaker, ...line }) => {
      const voice = sayIn[at++]
      if (voice === undefined) throw new Error(`${rest.id}: no voice`)
      return { ...line, voice }
    }),
  }))
}

/** A card's scene, the `i`th of the essay's: what it says, in whose voice. */
function cardScene(shot: Shot, i: number): UnvoicedScene {
  const file = stillFile(i, shot.id)
  const spoken = shot.spoken
  if (spoken?.role === "scene") {
    const { chapter, narration } = spoken
    const told = {
      file: `${file}-narration`,
      said: narration,
      speaker: "narrator",
    } as const
    // C1027: a scene that goes on in its chapter says its narration alone.
    if (chapter === undefined)
      return { id: shot.id, file, shot, said: narration, lines: [told] }
    return {
      id: shot.id,
      file,
      shot,
      said: `${chapter} ${narration}`,
      lines: [
        { file: `${file}-chapter`, said: chapter, speaker: "host" },
        told,
      ],
      mark: chapterTitle(chapter),
    }
  }
  const said =
    spoken?.role === "intro" || spoken?.role === "close" ? spoken.said : ""
  return {
    id: shot.id,
    file,
    shot,
    said,
    lines: [{ file, said, speaker: "host" }],
    ...(spoken?.role === "close" ? { mark: CLOSE_MARK } : {}),
  }
}

/** Every take a spoken essay's scenes are said in, in order. */
export const cardsLines = (
  scenes: ReadonlyArray<CardsScene>
): Array<CardsLine> => scenes.flatMap((scene) => scene.lines)

/**
 * About how long a spoken essay runs, from its words alone, as the call's
 * is (`estimatedMs`).
 */
export const estimatedCardsMs = (cut: CutList): number =>
  estimatedMs(cardsScenes(cut))

/** Each chapter a spoken essay's scenes open, for the upload's description. */
export const cardsChapterMarks = (
  scenes: ReadonlyArray<CardsScene>
): Array<ChapterMark> =>
  scenes.flatMap((scene) =>
    scene.mark === undefined ? [] : [{ scene: scene.id, title: scene.mark }]
  )

/**
 * Takes laid on one timeline, each from its start in `startsMs` (in order,
 * none before the end of the take before it): how long it runs, and each
 * word's place in it. The recorder lays their audio the same way, silence
 * filling each gap.
 */
export function laidTake(
  takes: ReadonlyArray<StillTake>,
  startsMs: ReadonlyArray<number>
): StillTake {
  let end = 0
  const words: Array<TimedWord> = []
  for (const [i, take] of takes.entries()) {
    const at = startsMs[i] ?? end
    if (at < end)
      throw new RangeError(
        `take ${String(i)} starts before the one before it ends`
      )
    for (const word of take.words ?? [])
      words.push({
        ...word,
        startMs: word.startMs + at,
        endMs: word.endMs + at,
      })
    end = at + take.ms
  }
  return { ms: end, ...(takes.some((t) => t.words) ? { words } : {}) }
}

/** Where each of `takes` starts when each follows the one before after `gapMs`. */
export const startsAfter = (
  takes: ReadonlyArray<StillTake>,
  gapMs: number
): Array<number> => {
  let at = 0
  return takes.map((take, i) => {
    if (i > 0) at += gapMs
    const start = at
    at += take.ms
    return start
  })
}

/**
 * Takes said one after another, `CHAPTER_GAP_MS` apart, as one: how long it
 * runs, and each word's place in it. The recorder joins their audio the
 * same way.
 */
export const joinedTake = (takes: ReadonlyArray<StillTake>): StillTake =>
  laidTake(takes, startsAfter(takes, CHAPTER_GAP_MS))

/**
 * The take `scene` plays, as a file name without `.wav`, named here once for
 * both ends (CT1, #3519). A scene of several lines plays their join,
 * `<file>`, which the recorder lays there. A scene of one line plays that
 * line's own take, as the speaker recorded it: a chapter that goes on says
 * its narration alone, `<file>-narration` (C1027); the intro's and close's
 * one line is `<file>` itself. A spoken card's scene plays the take
 * recorded with its still, `<file>`, which its one line, if any, is named.
 */
export const sceneTakeFile = (scene: CardsScene): string =>
  scene.lines.length === 1 ? (scene.lines[0]?.file ?? scene.file) : scene.file

/**
 * How a spoken essay's scenes join (HOST18, #3571; C1545): policy, moved
 * with the story (C771). The owner: "When we go from scene to scene, it's
 * like a very sharp cut. It's kind of jarring." So a scene comes in by a
 * crossfade, and a scene that opens a chapter by one twice as long, so a new
 * chapter reads as one without the screen going dark at every card (most of
 * a cards essay's scenes open one). Either is drawn over the scene before it
 * held on (`hold`), so the sound is the cut version's.
 */
export const CARDS_JOINS = {
  within: "crossfade",
  chapter: "slow-crossfade",
} as const satisfies Readonly<Record<"within" | "chapter", Transition>>

/** How much longer than both of its transition's halves a scene must run to take it. */
const JOIN_ROOM_MS = 100

/**
 * The transition into the `i`th of `shots`: the scene's own, where it names
 * one; none into the first, or into or out of a composition, which draws its
 * own way in and out; a cut into or out of a spoken card's scene, whose
 * still draws the cast inside the picture, so a crossfade would blend two
 * pictures of it and show a character twice (C1546); a cut where either
 * scene is too short to hold the join; else `CARDS_JOINS`'s, by whether it
 * opens a chapter (`mark`).
 */
function joinInto(
  shots: ReadonlyArray<Shot>,
  scenes: ReadonlyArray<CardsScene>,
  i: number
): Transition | undefined {
  const shot = shots[i]
  const before = shots[i - 1]
  if (!shot || !before) return undefined
  if (shot.overrides.transitionIn !== undefined)
    return shot.overrides.transitionIn
  if (isComposition(shot) || isComposition(before)) return undefined
  if (scenes[i]?.spoken !== undefined || scenes[i - 1]?.spoken !== undefined)
    return "cut"
  const mark = scenes[i]?.mark
  const join = mark === undefined ? CARDS_JOINS.within : CARDS_JOINS.chapter
  const room = 2 * TRANSITION_MS[join] + JOIN_ROOM_MS
  return Math.min(shot.durationMs, before.durationMs) < room ? "cut" : join
}

/**
 * The spoken essay as the cut list the renderer draws: a scene per card
 * (`cardsScenes`), held for its take, `takes[i]` (`heldFor`), and
 * captioned from the take's words. Its scenes join by `CARDS_JOINS`, each
 * drawn over the scene before it held on, so every take plays where a cut
 * would play it (HOST18).
 */
export function voicedCardsCutList(
  cut: CutList,
  scenes: ReadonlyArray<CardsScene>,
  takes: ReadonlyArray<StillTake | null>
): CutList {
  const shots: ReadonlyArray<Shot> = scenes.map((scene, i) => {
    const { spoken: _spoken, ...shot } = scene.shot
    const held = heldFor(
      { ...scene, file: sceneTakeFile(scene) },
      takes[i] ?? null
    )
    if (scene.spoken === undefined) return { ...shot, ...held }
    // A spoken card's scene is its stage's still, held still as a voiced
    // feed's are (CV1); the owner's answer cites the take it plays.
    const take = scene.spoken.scene.take
    return {
      ...shot,
      id: scene.id,
      picture: { kind: "still" as const, source: `${scene.file}.png` },
      ...held,
      overrides: {
        motion: { kind: "still" as const },
        ...(shot.overrides.transitionIn === undefined
          ? {}
          : { transitionIn: shot.overrides.transitionIn }),
      },
      burnIns: [],
      idea:
        take === undefined
          ? { origin: "agent" as const }
          : {
              origin: "you" as const,
              from: { kind: "take" as const, id: take },
            },
    }
  })
  return {
    ...cut,
    joins: "hold",
    shots: shots.map((shot, i) => {
      const transitionIn = joinInto(shots, scenes, i)
      return transitionIn === undefined
        ? shot
        : { ...shot, overrides: { ...shot.overrides, transitionIn } }
    }),
    burnIns: [
      ...cut.burnIns.filter((b) => !isCaptions(b)),
      { kind: "captions", params: {} },
    ],
  }
}

/**
 * Every reason a `cards/` folder can't be published: its index unread, an
 * essay it lists missing, refused (`parseCardsEssay`), pinning a version of
 * its series `seriesOf` doesn't hold or asking that series for what it
 * lacks (a look's cues or bed, a burn-in it has no design for: `resolve`),
 * and an essay file the index forgets. `files` is the folder's JSON files by name, `index.json` among
 * them.
 */
export function cardsFolderProblems(
  files: ReadonlyMap<string, unknown>,
  seriesOf: (id: string, version: number) => Series | null
): Array<string> {
  const index = parseCardsIndex(files.get("index.json"))
  if (!index.ok) return index.problems.map((p) => `index.json: ${p}`)
  const listed = new Set(index.value.essays.map((e) => `${e.key}.json`))
  return [
    ...index.value.essays.flatMap(({ key }, i) => {
      const name = `${key}.json`
      if (!files.has(name))
        return [`${name}: the index lists it, and there is no such file`]
      const essay = parseCardsEssay(key, files.get(name))
      if (!essay.ok) return essay.problems.map((p) => `${name}: ${p}`)
      // C374.
      if (i === 0 && !isSpokenEssay(essay.value))
        return [
          `${name}: it's silent, and the newest essay is spoken: it pins version ${CARDS_SPOKEN_VERSION} or later of its series, with an intro and narration for every scene`,
        ]
      const { id, version } = essay.value.series
      const series = seriesOf(id, version)
      if (series === null) return [`${name}: ${id} has no version ${version}`]
      const framed = withSeries(essay.value, series)
      const resolved = framed.ok ? resolve(framed.value, series) : framed
      return resolved.ok ? [] : resolved.problems.map((p) => `${name}: ${p}`)
    }),
    ...[...files.keys()]
      .filter((name) => name !== "index.json" && !listed.has(name))
      .map((name) => `${name}: the index doesn't list it`),
  ]
}

/**
 * The first day an essay owes what `cardsPublishProblems` holds: an essay
 * already published before it keeps what it was published with, so the
 * folder is never refused for one (#3476).
 */
export const PUBLISH_SINCE = "2026-11-24"

/**
 * What the essays being published, the newest day's, owe that an older one
 * didn't (#3476): what every video in their series carries
 * (`bookends.ts`), so a bookend their series' version lacks or a bed one
 * turns off for itself, since only a series opts out, never a video; and a
 * screen of ours in each chapter that speaks of one (`shown.ts`, SHOW1). An
 * older essay keeps what it was published with, and one the folder check
 * refuses is that check's to report.
 */
export function cardsPublishProblems(
  files: ReadonlyMap<string, unknown>,
  seriesOf: (id: string, version: number) => Series | null
): Array<string> {
  const index = parseCardsIndex(files.get("index.json"))
  const essays = index.ok ? index.value.essays : []
  const newest = dayOf(essays[0]?.key)
  return essays
    .filter(({ key }) => dayOf(key) === newest && dayOf(key) >= PUBLISH_SINCE)
    .flatMap(({ key }) => {
      const essay = parseCardsEssay(key, files.get(`${key}.json`))
      if (!essay.ok) return []
      const series = seriesOf(essay.value.series.id, essay.value.series.version)
      if (series === null) return []
      const bed = isSeriesId(series.id) && bookendsOf(series.id).has("bed")
      return [
        ...bookendProblems(series).map(
          (p) => `${p}; pin the newest version that does`
        ),
        ...(essay.value.music === "off" && bed
          ? [
              `it turns the music bed off, and every video in ${series.id} plays it: leave "music" out`,
            ]
          : []),
        ...unshownProblems(essay.value),
      ].map((p) => `${key}.json: ${p}`)
    })
}

/**
 * Every listed essay's sources held to its stamp's commits through `read`
 * (#3036, `sourceProblems`), each line naming its file. The newest day's
 * essays, those being published, are held strictly: a commit their
 * sources can't be read at refuses them. An essay the folder check refuses is that check's to
 * report, so it is passed over here.
 */
export function cardsFolderSources(
  files: ReadonlyMap<string, unknown>,
  read: ReadFile
): SourceCheck {
  const index = parseCardsIndex(files.get("index.json"))
  const problems: Array<string> = []
  const notes: Array<string> = []
  const essays = index.ok ? index.value.essays : []
  // Every essay of the newest day is held strictly: one publish may add
  // several, and the index orders them by day alone.
  const newest = dayOf(essays[0]?.key)
  for (const { key } of essays) {
    const name = `${key}.json`
    const essay = parseCardsEssay(key, files.get(name))
    if (!essay.ok) continue
    const check = sourceProblems(essay.value, read, dayOf(key) === newest)
    problems.push(...check.problems.map((p) => `${name}: ${p}`))
    notes.push(...check.notes.map((n) => `${name}: ${n}`))
  }
  return { problems, notes }
}
