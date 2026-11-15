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
 * no captures or takes for one: every scene is a card picture.
 *
 * From the cheat-sheet series' version 2 (EXPLAIN6, #3021, C370, C371) an essay is
 * spoken, a podcast you can watch: its first scene is the intro, every scene
 * after it has a chapter line and narration, and the last may be the close
 * (`Spoken`). The recorder has home's Kokoro speaker say each line, holds
 * the card for its take and captions it (`voicedCardsCutList`). An essay in
 * version 1 is silent, and stays as it was first served.
 */

import { z } from "zod"

import type { ChapterMark } from "./chapters"
import type { CutList, Parsed, Shot } from "./cut-list"
import { isCaptions, parseCutList, problemsOf } from "./cut-list"
import { resolve } from "./resolve"
import type { Series } from "./series"
import { withSeries } from "./series"
import {
  estimatedMs,
  FEED_SPEAKER,
  readingMs,
  stillFile,
  TAIL_MS,
  VOICE_IN_MS,
} from "./stills"
import type { StillTake } from "./stills"

export const CARDS_INDEX_SCHEMA = "some-ui.cards-index/1"

/** The series a cards essay may be drawn in. */
export const CARDS_SERIES: ReadonlySet<string> = new Set(["cheat-sheet"])

/** The first version of a cards series whose essays are spoken (C371). */
export const CARDS_SPOKEN_VERSION = 2

/** Whether `cut` is a spoken essay: drawn in a version that is (C371). */
export const isSpokenEssay = (cut: CutList): boolean =>
  cut.series.version >= CARDS_SPOKEN_VERSION

/**
 * Who says a spoken essay, by Kokoro's voice names (C372): the host, the
 * weekly call's, says the intro, each chapter line and the close; the
 * narrator teaches each card. The voice changing is how a listener hears a
 * new chapter begin.
 */
export const CARDS_VOICES = {
  host: "am_michael",
  narrator: "af_heart",
} as const

/**
 * The longest a spoken essay runs, by its words: the weekly call's part,
 * ten minutes (owner, 2026-11-14). A longer subject is two essays (C373).
 */
export const CARDS_MOST_MS = 600_000

/** What a scene's chapter line is said over, after the scene's own id. */
const CHAPTER = "-chapter"

/** The longest id a spoken scene has, so its chapter's is a scene id too. */
const SPOKEN_ID_MOST = 64 - CHAPTER.length

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
 * its stamp's day, a series that isn't a cards series, a scene that isn't
 * a card, plays a take or a cue or stands on an image, and captions; in a
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
      .filter((s) => s.picture.kind !== "card")
      .map((s) => `${s.id}: its picture is a ${s.picture.kind}, not a card`),
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

/**
 * Every reason a spoken essay can't be said: a scene that says nothing, no
 * intro first, an intro or a close out of place, no scene that teaches, an
 * id too long for its chapter's, and words that run past `CARDS_MOST_MS`.
 * Whether each line is one the speaker can say is the cut list's own
 * (`SayableSchema`).
 */
function spokenProblems(cut: CutList): Array<string> {
  const { shots } = cut
  const ids = new Set(shots.map((s) => s.id))
  const last = shots.length - 1
  const problems: Array<string> = []
  if (shots[0]?.spoken?.role !== "intro")
    problems.push(
      "it has no intro: its first scene's role is intro, saying why you'd reach for this and what you'll be able to do"
    )
  if (!shots.some((s) => s.spoken?.role === "scene"))
    problems.push("it has no scene with a chapter line and narration")
  shots.forEach((s, i) => {
    const role = s.spoken?.role
    if (role === undefined)
      problems.push(
        `${s.id}: it says nothing, and every scene of a spoken essay has a chapter line and narration`
      )
    if (role === "intro" && i !== 0)
      problems.push(`${s.id}: only the first scene is the intro`)
    if (role === "close" && i !== last)
      problems.push(`${s.id}: only the last scene is the close`)
    if (role === "scene" && s.id.length > SPOKEN_ID_MOST)
      problems.push(
        `${s.id}: a spoken scene's id is at most ${SPOKEN_ID_MOST} characters, so its chapter's is an id too`
      )
    if (role === "scene" && ids.has(`${s.id}${CHAPTER}`))
      problems.push(
        `${s.id}: its chapter line is said over ${s.id}${CHAPTER}, which another scene is called`
      )
  })
  const ms = estimatedCardsMs(cut)
  if (ms > CARDS_MOST_MS)
    problems.push(
      `it runs about ${Math.ceil(ms / 60_000)} minutes by its words, and a spoken essay runs at most ${CARDS_MOST_MS / 60_000}: split it into two essays`
    )
  return problems
}

/**
 * A line of a spoken essay: the scene of the voiced cut list it is said
 * over, its files' name, what is said and in which voice, the essay's scene
 * it shows, and the chapter it opens, for the upload's chapter marks.
 */
export type CardsLine = {
  readonly id: string
  /** Without extension: `<file>.wav`, `<file>.words.json`. */
  readonly file: string
  /** Empty for a scene that says nothing, held for its own `durationMs`. */
  readonly said: string
  readonly voice: string
  readonly shot: Shot
  readonly mark?: string
}

/** The title of the close's chapter mark. */
export const CLOSE_MARK = "What to do next"

/**
 * What a spoken essay says, in order: the intro, each scene's chapter line
 * in the host's voice then its narration in the narrator's, and the close.
 * A scene's chapter line is said over its card, as its own scene,
 * `<id>-chapter`, so each chapter starts where its line does.
 */
export function cardsLines(cut: CutList): Array<CardsLine> {
  const lines = cut.shots.flatMap((shot): Array<Omit<CardsLine, "file">> => {
    const spoken = shot.spoken
    const host = { voice: CARDS_VOICES.host, shot }
    if (spoken === undefined) return [{ ...host, id: shot.id, said: "" }]
    if (spoken.role === "scene")
      return [
        {
          ...host,
          id: `${shot.id}${CHAPTER}`,
          said: spoken.chapter,
          mark: spoken.chapter,
        },
        {
          voice: CARDS_VOICES.narrator,
          shot,
          id: shot.id,
          said: spoken.narration,
        },
      ]
    return [
      {
        ...host,
        id: shot.id,
        said: spoken.said,
        ...(spoken.role === "close" ? { mark: CLOSE_MARK } : {}),
      },
    ]
  })
  return lines.map((line, i) => ({ ...line, file: stillFile(i, line.id) }))
}

/** How long a line holds with nothing said: its words' reading time, or a silent scene's own. */
const unsaidLineMs = (line: CardsLine): number =>
  line.said === "" ? line.shot.durationMs : readingMs(line.said)

/**
 * About how long a spoken essay runs, from its words alone, as the call's
 * is estimated (`estimatedMs`): the recorder refuses one past the policy on
 * this before the speaker says a word.
 */
export const estimatedCardsMs = (cut: CutList): number =>
  estimatedMs(
    cardsLines(cut).map((line) => ({
      said: line.said,
      holdMs: unsaidLineMs(line),
    }))
  )

/** Each chapter a spoken essay's lines open, for the upload's description. */
export const cardsChapterMarks = (
  lines: ReadonlyArray<CardsLine>
): Array<ChapterMark> =>
  lines.flatMap((line) =>
    line.mark === undefined ? [] : [{ scene: line.id, title: line.mark }]
  )

/**
 * The spoken essay `cut` as the cut list the renderer draws: a scene per
 * line (`cardsLines`), its card held for its take, `takes[i]`
 * (`<file>.wav`, home's speaker's), and captioned from the take's words. A
 * line with no take (the recorder run with `--voices none`) holds for its
 * words' reading time. A scene's narration cuts in from its own chapter
 * line, over the same card.
 */
export function voicedCardsCutList(
  cut: CutList,
  lines: ReadonlyArray<CardsLine>,
  takes: ReadonlyArray<StillTake | null>
): CutList {
  return {
    ...cut,
    shots: lines.map((line, i) => {
      const { spoken, ...shot } = line.shot
      const take = takes[i] ?? null
      const narration = line.id === shot.id && spoken?.role === "scene"
      return {
        ...shot,
        id: line.id,
        durationMs:
          take === null ? unsaidLineMs(line) : VOICE_IN_MS + take.ms + TAIL_MS,
        voiceInMs: VOICE_IN_MS,
        ...(narration
          ? { overrides: { ...shot.overrides, transitionIn: "cut" as const } }
          : {}),
        ...(take === null
          ? {}
          : {
              take: {
                file: `${line.file}.wav`,
                inMs: 0,
                outMs: take.ms,
                ...(take.words ? { words: [...take.words] } : {}),
              },
              speaker: FEED_SPEAKER,
            }),
      }
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
      // The newest essay is spoken (C374); older ones keep the version they
      // were first served in, as the call's older weeks do.
      if (i === 0 && !isSpokenEssay(essay.value))
        return [
          `${name}: it's silent, and the newest essay is spoken: it pins version ${CARDS_SPOKEN_VERSION} or later of its series, with an intro and a chapter line and narration for every scene`,
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
