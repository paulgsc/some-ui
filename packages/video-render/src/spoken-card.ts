/**
 * A spoken card (WALK7, paulgsc/some-ui#3282): a scene of a cards essay that
 * plays the owner's own voice from home, mapped to its category's template.
 * An `introduction` is template A, the essays' call (`essay.ts`): the one
 * asking and the owner, the one speaking lit. For each exchange the question
 * is said in Kokoro, in the asker's voice (`ESSAY_VOICES.asker`), and then
 * the owner's take plays whole, captioned from what home heard in it. Code
 * lays every frame from the take's metadata; nothing is cut or edited (the
 * owner, 2026-11-20: "me editing anything defeats the thing").
 *
 * The cut list names each take by its home id (`Spoken`'s `spoken` role).
 * Home hands the recorder, for each id, its audio `<id>.<ext>`, its word
 * times `<id>.words.json` where it kept them, and its transcript
 * `<id>.transcript.json` (`some-ui.voice-transcript/1`, with its verdict):
 * `spokenTakeFilesOf`. A take home couldn't make out, or heard nothing in,
 * is refused before anything is drawn (`heardSpokenCard`, HEARD2), since a
 * spoken card has no silence to play in its place.
 */

import { isRecord } from "@some-ui/core-utils"
import type { SessionThemeId } from "@some-ui/styles/theme/registry"
import { z } from "zod"

import type { CutList, Parsed, Shot, SpokenCategory } from "./cut-list"
import {
  problemsOf,
  SPOKEN_CATEGORIES,
  SPOKEN_EXCHANGES_MOST,
  SPOKEN_TAKE_ID,
} from "./cut-list"
import { ESSAY_VOICES } from "./essay"
import type { Speaker } from "./essay"
import { ThemeIdSchema, words } from "./format"
import { askProblems, wordCount } from "./opening"
import type { Exchange } from "./opening"
import { takeFilesOf } from "./take-files"
import type { TakeFiles } from "./take-files"
import { hearingOf } from "./verdict"

/** A spoken card's shot: its `spoken` is the `spoken` role. */
export type SpokenCard = Extract<
  NonNullable<Shot["spoken"]>,
  { role: "spoken" }
>

/**
 * A spoken card's exchange: the opening's (`Exchange`), answered by a take
 * home keeps; and as its stage draws it, with what home heard in that take.
 */
export type SpokenExchange = Exchange<{ readonly take: string }>
export type HeardExchange = Exchange<{
  readonly take: string
  readonly transcript: string
}>

/** Each category's title, on its scenes and as the chapter its card opens. */
export const SPOKEN_CATEGORY_TITLES: Readonly<Record<SpokenCategory, string>> =
  { introduction: "Introduction" }

/** The longest a spoken card's id is, so each of its scenes' ids fits a cut list's (64). */
export const SPOKEN_CARD_ID_MOST = 56

export const SPOKEN_CARD_SCHEMA = "some-ui.spoken-card/1"

/**
 * A spoken card as its stage draws it: the card's id, its category, and
 * each exchange with what home heard in its take. The recorder writes it
 * from the cut list and home's transcripts (`heardSpokenCard`); the stage
 * reads nothing else.
 */
export const HeardSpokenCardSchema = z.strictObject({
  schema: z.literal(SPOKEN_CARD_SCHEMA),
  card: z.string().min(1).max(SPOKEN_CARD_ID_MOST),
  category: z.enum(SPOKEN_CATEGORIES),
  /** The app's theme its stage draws template A in: its series' (`Series.theme`, C816). */
  theme: ThemeIdSchema.optional(),
  exchanges: z
    .array(
      z.strictObject({
        ask: words,
        take: z.string().regex(SPOKEN_TAKE_ID),
        transcript: words,
      })
    )
    .min(1)
    .max(SPOKEN_EXCHANGES_MOST),
})

export type HeardSpokenCard = z.infer<typeof HeardSpokenCardSchema>

export function parseHeardSpokenCard(raw: unknown): Parsed<HeardSpokenCard> {
  const parsed = HeardSpokenCardSchema.safeParse(raw)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, problems: problemsOf(parsed.error, "spoken card") }
}

/** One scene of a spoken card: the question asked, or the owner's take of its answer. */
export type SpokenScene = {
  /** Its id on the card's stage: `ask-<n>` or `take-<n>`, from 1. */
  readonly id: string
  readonly exchange: number
  readonly speaker: Extract<Speaker, "asker" | "you">
  readonly said: string
  /** The owner's take it plays, for the answer. */
  readonly take?: string
}

/** A card's scenes in order: each exchange's question, then its answer. */
export const spokenScenes = (
  card: Pick<HeardSpokenCard, "exchanges">
): ReadonlyArray<SpokenScene> =>
  card.exchanges.flatMap(({ ask, take, transcript }: HeardExchange, i) => [
    { id: `ask-${i + 1}`, exchange: i + 1, speaker: "asker", said: ask },
    {
      id: `take-${i + 1}`,
      exchange: i + 1,
      speaker: "you",
      said: transcript,
      take,
    },
  ])

/**
 * The most words of an answer its stage writes out beside the bubbles: about
 * a minute at the teleprompter's 170 a minute, which fits the frame. A
 * longer answer is said in the captions alone, so a long take never stops
 * a render for a frame too full.
 */
export const SPOKEN_ANSWER_SHOWN_MOST = 170

/** Whether a spoken card's stage writes `said` out beside the bubbles. */
export const answerShown = (said: string): boolean =>
  wordCount(said) <= SPOKEN_ANSWER_SHOWN_MOST

/** The Kokoro voice that asks a spoken card's questions: the essays' asker. */
export const SPOKEN_ASKER_VOICE = ESSAY_VOICES.asker

/**
 * A spoken card's id: a letter first, and none of JSON's words, so the
 * stage's address reads it as a name (it reads `1` or `true` as a number or
 * a boolean, which names no card); and never `sample`, the stage's own
 * made-up card.
 */
const SPOKEN_CARD_ID = /^[A-Za-z][A-Za-z0-9_-]*$/

/** Ids a spoken card can't take: the stage's sample and JSON's words. */
const NOT_A_CARD_ID: ReadonlySet<string> = new Set([
  "sample",
  "true",
  "false",
  "null",
])

/** Every reason the spoken card `shot` can't be played, as lines for whoever wrote it. */
export function spokenCardProblems(
  shot: Shot,
  card: SpokenCard
): Array<string> {
  return [
    ...(SPOKEN_CARD_ID.test(shot.id) && !NOT_A_CARD_ID.has(shot.id)
      ? []
      : [
          `${shot.id}: a spoken card's id starts with a letter, and isn't "sample", "true", "false" or "null"`,
        ]),
    ...(shot.id.length > SPOKEN_CARD_ID_MOST
      ? [
          `${shot.id}: a spoken card's id is at most ${SPOKEN_CARD_ID_MOST} characters`,
        ]
      : []),
    ...(shot.burnIns.length > 0
      ? [
          `${shot.id}: a spoken card is drawn by its category's template, and takes no burn-ins`,
        ]
      : []),
    ...card.exchanges.flatMap(({ ask }, i) =>
      askProblems(ask, `${shot.id}.exchanges[${i}].ask`)
    ),
  ]
}

/** Each spoken card in `cut`, with its shot's id. */
export const spokenCardsOf = (
  cut: CutList
): ReadonlyArray<{ readonly id: string; readonly card: SpokenCard }> =>
  cut.shots.flatMap((shot) =>
    shot.spoken?.role === "spoken" ? [{ id: shot.id, card: shot.spoken }] : []
  )

/** Every take `cut`'s spoken cards play, each once, in order. */
export const spokenTakesOf = (cut: CutList): ReadonlyArray<string> => [
  ...new Set(
    spokenCardsOf(cut).flatMap(({ card }) => card.exchanges.map((e) => e.take))
  ),
]

/** The suffix of a take's transcript beside its audio: `<id>.transcript.json`. */
const TRANSCRIPT = ".transcript.json"

/** A take home hands a spoken card: its audio, its word times, and its transcript. */
export type SpokenTakeFiles = TakeFiles & { readonly transcript: string }

/**
 * Which of `names`, the folder home hands the recorder, is each of `takes`:
 * its audio and word times as an essay's (`takeFilesOf`), and its
 * transcript `<id>.transcript.json`. Refuses, with every reason, a take or
 * its transcript missing, two takes for one id, and a file for a take the
 * essay doesn't play.
 */
export function spokenTakeFilesOf(
  takes: ReadonlyArray<string>,
  names: ReadonlyArray<string>
): Parsed<Readonly<Record<string, SpokenTakeFiles>>> {
  const transcripts = new Set(
    names
      .filter((name) => !name.startsWith(".") && name.endsWith(TRANSCRIPT))
      .map((name) => name.slice(0, -TRANSCRIPT.length))
  )
  const files = takeFilesOf(
    { answered: takes, silent: [], unheard: [], noun: "take" },
    names.filter((name) => !name.startsWith(".") && !name.endsWith(TRANSCRIPT))
  )
  const problems = [
    ...(files.ok ? [] : files.problems),
    ...takes
      .filter((id) => !transcripts.has(id))
      .map(
        (id) => `${id}: home handed no transcript of it (${id}${TRANSCRIPT})`
      ),
    ...[...transcripts]
      .filter((id) => !takes.includes(id))
      .map((id) => `${id}${TRANSCRIPT}: names no take the essay plays`),
  ]
  if (!files.ok || problems.length > 0) return { ok: false, problems }
  return {
    ok: true,
    value: Object.fromEntries(
      Object.entries(files.value).map(([id, take]) => [
        id,
        { ...take, transcript: `${id}${TRANSCRIPT}` },
      ])
    ),
  }
}

/**
 * The spoken card `card`, shot `id`, as its stage draws it, in `theme` (its
 * series', `Series.theme`): each exchange
 * with what home heard in its take, `transcriptOf(take)` being the take's
 * `some-ui.voice-transcript/1` as home keeps it. Refuses, with every reason,
 * a take whose transcript is missing or has no text, and one home couldn't
 * make out or heard nothing in (HEARD2): a spoken card plays only a take
 * home heard.
 */
export function heardSpokenCard(
  id: string,
  card: SpokenCard,
  transcriptOf: (take: string) => unknown,
  theme: SessionThemeId | undefined
): Parsed<HeardSpokenCard> {
  const problems: Array<string> = []
  const exchanges = card.exchanges.map(
    ({ ask, take }: SpokenExchange): HeardExchange => {
      const body = transcriptOf(take)
      const text = isRecord(body) ? body["text"] : undefined
      const hearing = hearingOf(body)
      if (body === undefined)
        problems.push(
          `${id}: ${take} has no transcript, so nothing captions it`
        )
      else if (hearing === "unheard")
        problems.push(
          `${id}: home couldn't make out ${take}; a spoken card plays only a take home heard`
        )
      else if (hearing === "silent")
        problems.push(`${id}: home heard nothing said in ${take}`)
      else if (typeof text !== "string" || text.trim() === "")
        problems.push(`${id}: ${take}'s transcript has no text`)
      return {
        ask,
        take,
        transcript: typeof text === "string" ? text.trim() : "",
      }
    }
  )
  if (problems.length > 0) return { ok: false, problems }
  return parseHeardSpokenCard({
    schema: SPOKEN_CARD_SCHEMA,
    card: id,
    category: card.category,
    ...(theme === undefined ? {} : { theme }),
    exchanges,
  })
}

/** The stage's sample: a mock introduction, its takes made up (mock data, never the owner's). */
export const sampleSpokenCard = (): Parsed<HeardSpokenCard> =>
  parseHeardSpokenCard({
    schema: SPOKEN_CARD_SCHEMA,
    card: "sample",
    category: "introduction",
    // cheat-sheet v3's (`Series.theme`): the sample is a cards essay's, and
    // a test holds the two equal.
    theme: "dark",
    exchanges: [
      {
        ask: "What is this, and who made it?",
        take: "sample-take-1",
        transcript:
          "This is a sample. A made-up person answers here, in a take home kept, played whole with nothing cut.",
      },
      {
        ask: "Why make it with code?",
        take: "sample-take-2",
        transcript:
          "So the video says only what was recorded: the template lays out each frame from who spoke, and when.",
      },
    ],
  })

/**
 * Scene `id` of `card` (its first, for none or one it lacks), its place,
 * and all its scenes, as the stage draws them.
 */
export function spokenSceneAt(
  card: HeardSpokenCard,
  id: string | undefined
): {
  readonly scene: SpokenScene
  readonly index: number
  readonly scenes: ReadonlyArray<SpokenScene>
} {
  const scenes = spokenScenes(card)
  const found = scenes.findIndex((s) => s.id === id)
  const index = found < 0 ? 0 : found
  const scene = scenes[index]
  if (scene === undefined) throw new Error("a spoken card has an exchange")
  return { scene, index, scenes }
}
