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

import type { CutList, Parsed, Shot, SpokenTurn } from "./cut-list"
import { problemsOf, SPOKEN_EXCHANGES_MOST, SPOKEN_TAKE_ID } from "./cut-list"
import { ESSAY_VOICES } from "./essay"
import type { Speaker } from "./essay"
import { ThemeIdSchema, words } from "./format"
import { askProblems, wordCount } from "./opening"
import type { Exchange } from "./opening"
import { SPOKEN_CATEGORIES } from "./spoken-categories"
import { takeFilesOf } from "./take-files"
import type { TakeFiles } from "./take-files"
import { hearingOf } from "./verdict"

/** A spoken card's shot: its `spoken` is the `spoken` role. */
export type SpokenCard = Extract<
  NonNullable<Shot["spoken"]>,
  { role: "spoken" }
>

/**
 * A spoken card's exchange: the opening's (`Exchange`), its question and its
 * answer each a turn in one of two voices (`SpokenTurn`); and as its stage
 * draws it, each owner's turn with what home heard in its take.
 */
export type SpokenExchange = Exchange<
  { readonly answer: SpokenTurn },
  SpokenTurn
>

/** A turn as its stage draws it: Kokoro's line, or the owner's take with what home heard in it. */
export const HeardTurnSchema = z.discriminatedUnion("voice", [
  z.strictObject({ voice: z.literal("kokoro"), said: words }),
  z.strictObject({
    voice: z.literal("owner"),
    take: z.string().regex(SPOKEN_TAKE_ID),
    transcript: words,
  }),
])

export type HeardTurn = z.infer<typeof HeardTurnSchema>

export type HeardExchange = Exchange<{ readonly answer: HeardTurn }, HeardTurn>

/** A turn's voice: Kokoro's, or the owner's own. */
export type TurnVoice = SpokenTurn["voice"]

/** A turn's place in its exchange. */
export type TurnRole = "ask" | "answer"

/**
 * Whose bubble a turn lights on template A, by its place and its voice: the
 * owner is always You; Kokoro asking stands where the essays' asker does,
 * and Kokoro answering where their tutor does, so a cast draws each as its
 * own character (PDA6: a tin sparrow asks, a tin owlet answers).
 */
export const TURN_SPEAKER = {
  ask: { kokoro: "asker", owner: "you" },
  answer: { kokoro: "tutor", owner: "you" },
} as const satisfies Readonly<
  Record<TurnRole, Readonly<Record<TurnVoice, Speaker>>>
>

/** The bubble that stands opposite the owner's in an exchange: its Kokoro turn's. */
export const kokoroSpeaker = (
  exchange: HeardExchange
): (typeof TURN_SPEAKER)[TurnRole]["kokoro"] =>
  exchange.ask.voice === "kokoro"
    ? TURN_SPEAKER.ask.kokoro
    : TURN_SPEAKER.answer.kokoro

/** What a turn says, as a caption reads it: Kokoro's line, or what home heard the owner say. */
export const turnSaid = (turn: HeardTurn): string =>
  turn.voice === "kokoro" ? turn.said : turn.transcript

/** The longest a spoken card's id is, so each of its scenes' ids fits a cut list's (64). */
export const SPOKEN_CARD_ID_MOST = 55

/** Version 2: an exchange is two turns, each in its voice (C817). */
export const SPOKEN_CARD_SCHEMA = "some-ui.spoken-card/2"

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
    .array(z.strictObject({ ask: HeardTurnSchema, answer: HeardTurnSchema }))
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

/** One scene of a spoken card: one turn, the question or the answer, in its voice. */
export type SpokenScene = {
  /** Its id on the card's stage: `ask-<n>` or `answer-<n>`, from 1. */
  readonly id: string
  readonly exchange: number
  readonly role: TurnRole
  readonly voice: TurnVoice
  readonly speaker: Speaker
  /** What is said: Kokoro's line, or what home heard in the owner's take. */
  readonly said: string
  /** The owner's take it plays, for an owner's turn. */
  readonly take?: string
}

/** Turn `turn`, its exchange's `role`, as the scene that plays it. */
const sceneOf = (turn: HeardTurn, role: TurnRole, n: number): SpokenScene => ({
  id: `${role}-${n}`,
  exchange: n,
  role,
  voice: turn.voice,
  speaker: TURN_SPEAKER[role][turn.voice],
  said: turnSaid(turn),
  ...(turn.voice === "owner" ? { take: turn.take } : {}),
})

/** A card's scenes in order: each exchange's question, then its answer. */
export const spokenScenes = (
  card: Pick<HeardSpokenCard, "exchanges">
): ReadonlyArray<SpokenScene> =>
  card.exchanges.flatMap(({ ask, answer }: HeardExchange, i) => [
    sceneOf(ask, "ask", i + 1),
    sceneOf(answer, "answer", i + 1),
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

/**
 * Kokoro's voice in a spoken card, asking or answering: the essays' asker's.
 * Its bubble differs by its place (`TURN_SPEAKER`), so a cast draws it as a
 * different character; the voice heard stays this one.
 */
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
    ...card.exchanges.flatMap(({ ask, answer }: SpokenExchange, i) => {
      const at = `${shot.id}.exchanges[${i}]`
      return [
        // Two voices: one of the owner's takes, one of Kokoro's lines.
        ...(ask.voice === answer.voice
          ? [
              `${at}: both turns are ${ask.voice === "owner" ? "the owner's takes" : "Kokoro's lines"}; an exchange is one of each`,
            ]
          : []),
        // A question Kokoro asks never assesses (C619); its answers may.
        ...(ask.voice === "kokoro" ? askProblems(ask.said, `${at}.ask`) : []),
      ]
    }),
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
    spokenCardsOf(cut).flatMap(({ card }) =>
      card.exchanges.flatMap(({ ask, answer }) =>
        [ask, answer].flatMap((turn) =>
          turn.voice === "owner" ? [turn.take] : []
        )
      )
    )
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
  const heard = (turn: SpokenTurn): HeardTurn => {
    if (turn.voice === "kokoro") return turn
    const { take } = turn
    const body = transcriptOf(take)
    const text = isRecord(body) ? body["text"] : undefined
    const hearing = hearingOf(body)
    if (body === undefined)
      problems.push(`${id}: ${take} has no transcript, so nothing captions it`)
    else if (hearing === "unheard")
      problems.push(
        `${id}: home couldn't make out ${take}; a spoken card plays only a take home heard`
      )
    else if (hearing === "silent")
      problems.push(`${id}: home heard nothing said in ${take}`)
    else if (typeof text !== "string" || text.trim() === "")
      problems.push(`${id}: ${take}'s transcript has no text`)
    return {
      voice: "owner",
      take,
      transcript: typeof text === "string" ? text.trim() : "",
    }
  }
  const exchanges = card.exchanges.map(
    ({ ask, answer }: SpokenExchange): HeardExchange => ({
      ask: heard(ask),
      answer: heard(answer),
    })
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
        ask: { voice: "kokoro", said: "What is this, and who made it?" },
        answer: {
          voice: "owner",
          take: "sample-take-1",
          transcript:
            "This is a sample. A made-up person answers here, in a take home kept, played whole with nothing cut.",
        },
      },
      {
        // The other way round, as the DB essay has it: the owner asks.
        ask: {
          voice: "owner",
          take: "sample-take-2",
          transcript: "Why make it with code, and not cut it by hand?",
        },
        answer: {
          voice: "kokoro",
          said: "So the video says only what was recorded: the template lays out each frame from who spoke, and when.",
        },
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
