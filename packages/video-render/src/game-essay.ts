/**
 * The Game Week essay (GWB, #2074; D1–D32 of 2026-11-16), the third data
 * essay beside the Rust Rounds essay (`essay.ts`) and the interview essay
 * (`interview-essay.ts`): once a week, the owner's bites on the week's NFL
 * games, each answered by the host, set on slides. Its data
 * (`GameEssaySchema`, `some-ui.game-essay/1`) is its DNA with the template:
 * every word said and everything shown come from it.
 *
 * Its scenes, in the same order every time (`gameEssayFormat`):
 *
 * 1. `open`: the week, and the games it holds.
 * 2. For each game, the team it is read for's first (D3):
 *    - `game`: the game, its two teams and how it ended for the team;
 *    - for each bite of the game, in each placement in the order they were
 *      said: `setup`, the host's setup over one still of the play home
 *      matched it to (none for a bite matched to none, D12); `bite`, the bite
 *      in the owner's voice or read aloud (D5–D7); `happened`, what came of
 *      it, only when the still doesn't show it (D11); and `answer`, the
 *      host's answer in the way its stance calls for (D21);
 *    - `halftime`, between a game's first half and its second (D10).
 *
 *    A game's bites are filed where home's week file puts them: a half,
 *    or before or after the game (`GAME_PLACEMENTS`, C1242). Whose voice says each is
 *    code's (`gameVoiceOf`, D5), for the writer to set `voice` by.
 * 3. `close`: the week, closed, after a chapter slide of its own.
 *
 * **What the essay never is (section 0, D20; the owner, 2026-11-15):** a
 * recreation of the game, play by play. Its four rules, each held here:
 *
 * - _Every scene stands on a bite._ Held by the type: a scene apart from the
 *   open, a game's card, halftime and the close is made only from a bite,
 *   and a half or a game with no bite is refused.
 * - _The game is context, one still per bite._ Held by the type: a bite
 *   carries at most one `still`, the moment of the play home matched it to;
 *   a bite home matched to none carries none (D12). Nothing holds a
 *   sequence of plays.
 * - _Our words, never theirs._ Checked: no line Kokoro says repeats
 *   `QUOTE_RUN` words in a row of any matched play's text (`quoteProblems`):
 *   the host's lines, and a bite read aloud by the second voice. The play's
 *   text is in the data only for this check, and is never drawn or said. A
 *   bite in the owner's own voice is theirs, so it is not held to it.
 * - _The editorial has a fixed shape._ Held by the type: a bite's `stance`
 *   is one of `STANCES`. How the host answers each (`STANCE_ANSWERS`, a
 *   total record) is what the writer is held to; no check reads the answer.
 *
 * The look is the Rust essay's, template A: the host and the owner, the one
 * speaking lit, in the call's series.
 */

import { addDays, isoWeekMonday } from "@some-ui/core-utils"
import {
  HALVES,
  isScenarioId,
  type Half,
  type ScenarioId,
} from "@some-ui/game-scenarios"
import { z } from "zod"

import { CALL_ID, CALL_STAGE_WIDTH, day, nightInMotion, sayDay } from "./call"
import type { LockedIntro } from "./call"
import type { ChapterMark } from "./chapters"
import { chapterSlides } from "./chapters"
import { once, problemsOf } from "./cut-list"
import type { CutList, Parsed } from "./cut-list"
import { weekId } from "./essay"
import type { Speaker, Voicing } from "./essay"
import { FORMAT_SCHEMA, repeatedId, versionRefusal, words } from "./format"
import type { Format, Shape } from "./format"
import { hasCaptions, stillFile, stillsCutList } from "./stills"
import type { StillTake } from "./stills"
import { takeFilesOf } from "./take-files"
import type { TakeFiles } from "./take-files"
import sample from "./templates/game-essay/sample-essay.json" with { type: "json" }

export const GAME_ESSAY_SCHEMA = "some-ui.game-essay/1"

export const GAME_ESSAY_ID = "game-essay"

/** The newest version `gameEssayFormat` gives. */
export const GAME_ESSAY_VERSION = 1

/**
 * The fewest words in a row a line Kokoro says may share with a play's text
 * before it is refused as quoting it (section 0's third rule). Four words
 * ("at the CHI 45") are how anyone says where a ball is; five in a row of
 * ESPN's sentence is its sentence. Policy (C771, C1081).
 */
export const QUOTE_RUN = 5

/**
 * The average confidence, over the words home heard, below which a bite is
 * read aloud by the second voice (D5, the prototype's 0.70). Policy (C771,
 * C1242).
 */
export const READ_ALOUD_BELOW = 0.7

/**
 * Whose voice says a bite (D5–D7): the owner's own choice when they made
 * one, for any reason; otherwise code, from home's confidence in the words
 * it heard: read aloud below `READ_ALOUD_BELOW`, and in the owner's voice
 * when home kept no confidence (words heard before Oct 31). It is for the
 * writer to set a bite's `voice` by; the essay's data carries the voice,
 * not the confidence, so no check reads it back.
 */
export const gameVoiceOf = (
  confidence: number | null,
  chosen: "owner" | "read-aloud" | null
): "owner" | "read-aloud" =>
  chosen ??
  (confidence !== null && confidence < READ_ALOUD_BELOW
    ? "read-aloud"
    : "owner")

/**
 * Where a game's bites are filed (D10, C1242): a half, or before the game
 * or after it. Home's week file says where each bite goes (`placement`),
 * since only home knows whether a bite with no half of its own came before
 * the first play or after the final; the writer files each where home put
 * it, and the check holds a matched bite to its play's quarter.
 */
export const GAME_PLACEMENTS = ["before", ...HALVES, "after"] as const
export type GamePlacement = (typeof GAME_PLACEMENTS)[number]

/**
 * The days a week's essay covers (C1241): an NFL week, from the Tuesday of
 * ISO week `id` to the Monday after it, so its Sunday is in week `id` and a
 * Monday night game is with its Sunday.
 */
export function weekDaysOf(id: string): { from: string; to: string } | null {
  try {
    const from = addDays(isoWeekMonday(id.toUpperCase()), 1)
    return { from, to: addDays(from, 6) }
  } catch {
    // A 53rd week in a year of 52: `isoWeekMonday` refuses it.
    return null
  }
}

/** The most games and bites one essay holds, so a week's data stays a week's. Policy (C1081). */
const GAMES_MOST = 16
const BITES_MOST = 120

/**
 * The editorial's fixed shape (D21, as agreed 2026-11-16): the stance a
 * bite takes, the decision first. Versioned with the template: a new stance
 * is a new version.
 */
export const STANCES = [
  "decision",
  "umbrage",
  "nerves",
  "celebration",
  "injury",
] as const
export type Stance = (typeof STANCES)[number]

/**
 * How the host answers each stance (D21, the prototype's section 2b): what
 * the writer is held to when it words the host's answer.
 */
export const STANCE_ANSWERS: Readonly<Record<Stance, string>> = {
  decision:
    "Its own call, from home's numbers with the sample size said; it does not insist the owner's was irrational",
  umbrage: "Steelmans the call, then weighs it",
  nerves: "Says what was actually at stake",
  celebration: "Says why the moment was rare",
  injury: "What it changes for the game, never speculation",
}

type Section =
  | "open"
  | "game"
  | "setup"
  | "bite"
  | "happened"
  | "answer"
  | "halftime"
  | "close"

type Framing = "intro" | "brand-in" | "chapter" | "brand-out"

const MOST: Readonly<Record<Section, number | null>> = {
  open: null,
  game: GAMES_MOST,
  setup: BITES_MOST,
  bite: BITES_MOST,
  happened: BITES_MOST,
  answer: BITES_MOST,
  halftime: GAMES_MOST,
  close: null,
}

const scene = (
  id: Section,
  name: string,
  point: string,
  holdMs: number
): Format["scenes"][number] => {
  const most = MOST[id]
  return {
    id,
    name,
    point,
    picture: {
      kind: "capture",
      from: `the game essay's ${id} view`,
      cssWidth: CALL_STAGE_WIDTH,
    },
    holdMs,
    ...(most === null ? {} : { repeat: { max: most } }),
  }
}

/** Mochi Night with the moving brand, as its siblings; a chapter slide opens each game and the close. */
const SHAPE: Shape = nightInMotion({
  brand: { intro: true, outro: true },
  chapters: ["game", "close"],
  subtitles: "word",
})

/** Why `version` of the game essay's template can't be drawn here, or null (VS1). */
export const gameEssayVersionRefusal = (version: number): string | null =>
  versionRefusal("the game essay's template", GAME_ESSAY_VERSION, version)

/** The game essay's format at `version`; throws for one this build doesn't know. */
export function gameEssayFormat(version: number = GAME_ESSAY_VERSION): Format {
  const refused = gameEssayVersionRefusal(version)
  if (refused !== null) throw new Error(refused)
  return {
    schema: FORMAT_SCHEMA,
    id: GAME_ESSAY_ID,
    version,
    title: "The Game Week essay",
    series: { id: CALL_ID, version: 2 },
    look: "calm",
    scenes: [
      scene(
        "open",
        "The week",
        "The week's games, and what is said of them",
        20_000
      ),
      scene(
        "game",
        "The game",
        "Its two teams, and how it ended for the team it is read for",
        15_000
      ),
      scene(
        "setup",
        "The moment",
        "The host's setup, over one still of the play home matched the bite to, where it matched one",
        15_000
      ),
      scene(
        "bite",
        "Your bite",
        "Your bite, in your own voice or read aloud by the second voice",
        60_000
      ),
      scene(
        "happened",
        "What happened",
        "What came of it, only when the still doesn't already show it",
        10_000
      ),
      scene(
        "answer",
        "The host's answer",
        "The host's answer, in its stance's way",
        30_000
      ),
      scene(
        "halftime",
        "Halftime",
        "Where the game stood at the half, between its halves",
        20_000
      ),
      scene("close", "The week, closed", "What the week came to", 20_000),
    ],
    shape: { ...SHAPE, cast: "cast-v1", voices: "lanes-v1" },
  }
}

/** A team as ESPN's code names it: "SF", "CHI". */
const team = z.string().regex(/^[A-Z]{2,4}$/, "a team is its code, like SF")

/** A take's id on home, as a bite's voice note has it. */
const takeId = z
  .string()
  .regex(/^[A-Za-z0-9._:-]{1,64}$/, "a take's id is home's note id")

const scenarioId = z
  .string()
  .refine((id): id is ScenarioId => isScenarioId(id), {
    message: "it isn't a scenario of the catalog",
  })

const said = z.strictObject({ said: words })

/**
 * The one still of a bite (section 0's second rule; D13): the field, the
 * down and distance, the score and the clock at the snap of the play home
 * matched the bite to. Numbers only, never the play's words.
 */
const StillSchema = z.strictObject({
  /** The quarter of the snap: 1 to 4, 5 and on for overtime. */
  period: z.number().int().positive(),
  /** The game clock at the snap, as ESPN words it ("4:05"). */
  clock: z.string().regex(/^\d{1,2}:\d{2}$/, "a clock is like 4:05"),
  /** The team with the ball, absent between plays (a kickoff's, say). */
  possession: team.optional(),
  /** The down and the yards to go, absent on a kick or a try. */
  down: z.number().int().min(1).max(4).optional(),
  distance: z.number().int().min(0).max(99).optional(),
  /** The line of scrimmage: the yard line and whose side of the field it is on. */
  spot: z
    .strictObject({ side: team, yard: z.number().int().min(1).max(50) })
    .optional(),
  score: z.strictObject({
    away: z.number().int().nonnegative(),
    home: z.number().int().nonnegative(),
  }),
})

/** The play home matched a bite to (GWB7): its id, its text for the quote check, and the still. */
const PlaySchema = z.strictObject({
  /** ESPN's id for the play. */
  id: z.string().min(1),
  /** ESPN's text for the play: checked against, never drawn or said (section 0). */
  text: words,
  still: StillSchema,
})

const BiteSchema = z.strictObject({
  take: takeId,
  /** When the owner started saying it. */
  saidAt: z.iso.datetime({ offset: true }),
  /** The scenario it was said about, or null for one said first and never mapped, which the stage is to say as "Said first". */
  scenario: scenarioId.nullable(),
  stance: z.enum(STANCES),
  /**
   * Whose voice says it (D5–D7): the owner's own take, or the second Kokoro
   * voice reading what home heard, labelled "Your words · read aloud".
   */
  voice: z.enum(["owner", "read-aloud"]),
  /** What the owner said, as home heard it: the caption, and what is read aloud. */
  transcript: words,
  /** The play home matched it to, or null for none (D12: its stamp and scenario, no field). */
  play: PlaySchema.nullable(),
  /** The host's setup, said before the bite (D11: always). */
  setup: said,
  /** What happened, said after it, only when the still doesn't already show it (D11). */
  happened: said.optional(),
  /** The host's answer, in the way its stance calls for (`STANCE_ANSWERS`). */
  answer: said,
})

const HalfSchema = z.strictObject({
  half: z.enum(GAME_PLACEMENTS),
  bites: z.array(BiteSchema).min(1),
})

const GameSchema = z.strictObject({
  /** ESPN's event id. */
  id: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/, "a game's id is ESPN's"),
  away: team,
  home: team,
  /** The game's card. */
  game: said,
  /** Its halves with bites, and before and after it, in the game's order; one with none is left out. */
  halves: z.array(HalfSchema).min(1),
  /** Said between the first half and the second, when the essay has bites in both (D10). */
  halftime: said.optional(),
})

export const GameEssaySchema = z.strictObject({
  schema: z.literal(GAME_ESSAY_SCHEMA),
  template: z.strictObject({
    id: z.literal(GAME_ESSAY_ID),
    version: z
      .number()
      .int()
      .min(1)
      .max(GAME_ESSAY_VERSION, {
        message: `newer than this build knows: it draws up to version ${GAME_ESSAY_VERSION}, so publish a newer stage first`,
      }),
  }),
  week: z.strictObject({ id: weekId, from: day, to: day }),
  /** The team every game is read through (the epic's "Why": SF). */
  for: team,
  open: said,
  games: z.array(GameSchema).min(1).max(GAMES_MOST),
  close: said,
})

export type GameEssay = z.infer<typeof GameEssaySchema>
type GameEssayGame = GameEssay["games"][number]
type GameEssayBite = GameEssayGame["halves"][number]["bites"][number]

const isWordChar = (c: string): boolean =>
  (c >= "a" && c <= "z") || (c >= "0" && c <= "9")

/** `word` without the punctuation at either end, in one linear pass (no backtracking regex). */
function trimToWord(word: string): string {
  let start = 0
  let end = word.length
  while (start < end && !isWordChar(word.charAt(start))) start++
  while (end > start && !isWordChar(word.charAt(end - 1))) end--
  return word.slice(start, end)
}

/** The words of `text`, lowercased, without the punctuation around them. */
const wordsOf = (text: string): Array<string> =>
  text
    .toLowerCase()
    .split(/\s+/)
    .map(trimToWord)
    .filter((word) => word !== "")

/** Every run of `QUOTE_RUN` words in a row of `text`, joined. */
const runsOf = (text: string): Array<string> => {
  const all = wordsOf(text)
  const runs: Array<string> = []
  for (let i = 0; i + QUOTE_RUN <= all.length; i++)
    runs.push(all.slice(i, i + QUOTE_RUN).join(" "))
  return runs
}

/** Every line Kokoro says, the host's and a bite read aloud, by where it is in the essay. */
function kokoroLines(essay: GameEssay): Array<readonly [string, string]> {
  const lines: Array<readonly [string, string]> = [
    ["open", essay.open.said],
    ["close", essay.close.said],
  ]
  for (const game of essay.games) {
    lines.push([`${game.id}: its card`, game.game.said])
    if (game.halftime !== undefined)
      lines.push([`${game.id}: halftime`, game.halftime.said])
    for (const half of game.halves)
      for (const bite of half.bites) {
        lines.push([`${bite.take}: its setup`, bite.setup.said])
        if (bite.voice === "read-aloud")
          lines.push([`${bite.take}: read aloud`, bite.transcript])
        if (bite.happened !== undefined)
          lines.push([`${bite.take}: what happened`, bite.happened.said])
        lines.push([`${bite.take}: the host's answer`, bite.answer.said])
      }
  }
  return lines
}

/**
 * Section 0's third rule: every line Kokoro says that repeats `QUOTE_RUN`
 * words in a row of any matched play's text, as a problem. Any play's, not only its
 * own bite's, since a line can quote another moment of the week.
 */
function quoteProblems(essay: GameEssay): Array<string> {
  const quoted = new Set<string>()
  for (const game of essay.games)
    for (const half of game.halves)
      for (const bite of half.bites)
        if (bite.play !== null)
          for (const run of runsOf(bite.play.text)) quoted.add(run)
  const problems: Array<string> = []
  for (const [where, line] of kokoroLines(essay)) {
    const run = runsOf(line).find((each) => quoted.has(each))
    if (run !== undefined)
      problems.push(
        `${where}: it says "${run}", the play's text: Kokoro describes a moment from its numbers, in our words (section 0)`
      )
  }
  return problems
}

const PLACEMENT_ORDER: Readonly<Record<GamePlacement, number>> = {
  before: 0,
  first: 1,
  second: 2,
  overtime: 3,
  after: 4,
}

/** The half a quarter is in (C872): 1 and 2 the first, 3 and 4 the second, 5 and on overtime. */
const halfOfPeriod = (period: number): Half =>
  period <= 2 ? "first" : period <= 4 ? "second" : "overtime"

/** A half as a refusal says it: "the first half", "overtime". */
const HALF_SAID: Readonly<Record<GamePlacement, string>> = {
  before: "before the game",
  first: "the first half",
  second: "the second half",
  overtime: "overtime",
  after: "after the game",
}
const halfSaid = (half: GamePlacement): string => HALF_SAID[half]

/** Every reason a game's data contradicts itself. */
function gameProblems(game: GameEssayGame): Array<string> {
  const problems: Array<string> = []
  if (game.away === game.home) problems.push(`${game.id}: a team plays itself`)
  const order = game.halves.map((half) => PLACEMENT_ORDER[half.half])
  if (order.some((n, i) => i > 0 && n <= (order[i - 1] ?? -1)))
    problems.push(
      `${game.id}: its halves are out of the game's order, or one is there twice`
    )
  const both =
    game.halves.some((half) => half.half === "first") &&
    game.halves.some((half) => half.half === "second")
  if (both && game.halftime === undefined)
    problems.push(
      `${game.id}: it has bites in both halves, so halftime is said between them (D10)`
    )
  if (!both && game.halftime !== undefined)
    problems.push(
      `${game.id}: halftime is said only between bites of both halves`
    )
  for (const half of game.halves) {
    const said = half.bites.map((bite) => Date.parse(bite.saidAt))
    if (said.some((at, i) => i > 0 && at < (said[i - 1] ?? at)))
      problems.push(
        `${game.id}, ${halfSaid(half.half)}: its bites are not in the order they were said`
      )
  }
  const plays = new Set([game.away, game.home])
  for (const half of game.halves)
    for (const bite of half.bites) {
      if (bite.play === null) continue
      const { period, spot, possession } = bite.play.still
      if (halfOfPeriod(period) !== half.half)
        problems.push(
          `${bite.take}: its play is in ${halfSaid(halfOfPeriod(period))}, and it is filed under ${halfSaid(half.half)}`
        )
      if (spot !== undefined && !plays.has(spot.side))
        problems.push(
          `${bite.take}: its still's spot is on neither team's side`
        )
      if (possession !== undefined && !plays.has(possession))
        problems.push(
          `${bite.take}: its still gives the ball to a team not playing`
        )
    }
  return problems
}

/** Every reason the essay's parsed data contradicts itself. */
function problemsOfEssay(essay: GameEssay): Array<string> {
  const problems: Array<string> = []
  const days = weekDaysOf(essay.week.id)
  if (days === null)
    problems.push(`week: ${essay.week.id} is not a week of its year`)
  else if (essay.week.from !== days.from || essay.week.to !== days.to)
    problems.push(
      `week: ${essay.week.id} runs from ${days.from} to ${days.to}, Tuesday to Monday (C1241)`
    )
  const games = essay.games.map((game) => game.id)
  if (new Set(games).size !== games.length)
    problems.push("games: two share an id")
  const takes = essay.games.flatMap((game) =>
    game.halves.flatMap((half) => half.bites.map((bite) => bite.take))
  )
  if (new Set(takes).size !== takes.length)
    problems.push("bites: one take is in the essay twice")
  if (takes.length > BITES_MOST)
    problems.push(
      `bites: ${takes.length}, and an essay holds at most ${BITES_MOST}`
    )
  const ours = essay.games.map(
    (game) => game.away === essay.for || game.home === essay.for
  )
  if (ours.some((mine, i) => mine && ours.slice(0, i).some((one) => !one)))
    problems.push(`games: ${essay.for}'s come first (D3)`)
  for (const game of essay.games) problems.push(...gameProblems(game))
  problems.push(...quoteProblems(essay))
  return once(problems)
}

/** The game essay's data, or every reason it can't make an essay. */
export function parseGameEssay(raw: unknown): Parsed<GameEssay> {
  const parsed = GameEssaySchema.safeParse(raw)
  if (!parsed.success)
    return { ok: false, problems: problemsOf(parsed.error, "essay") }
  const problems = problemsOfEssay(parsed.data)
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, value: parsed.data }
}

/** The template's sample essay: NE at CHI, with a bite in each half and one unmatched. */
export const sampleGameEssay = (): Parsed<GameEssay> => parseGameEssay(sample)

/** One scene of a game essay: its section, its id in the video, who says it and what. */
export type GameEssayScene =
  | {
      readonly section: Exclude<Section | Framing, "chapter">
      /** Its section's id, or `<section>-<n>` for a repeated one's nth. */
      readonly id: string
      /** The game it belongs to, by ESPN's id. */
      readonly game?: string
      /** The bite it belongs to, by its take. */
      readonly take?: string
      readonly speaker: Speaker
      /** What is said over it; empty for a brand slide. */
      readonly said: string
    }
  | {
      readonly section: "chapter"
      readonly id: string
      /** The scene the chapter slide opens. */
      readonly of: Section
      /** The game it opens; none for the close's. */
      readonly game?: string
      readonly title: string
      readonly speaker: Speaker
      readonly said: string
    }

/** Every bite of the essay, in its order. */
const bitesOf = (essay: GameEssay): Array<GameEssayBite> =>
  essay.games.flatMap((game) => game.halves.flatMap((half) => half.bites))

/**
 * The locked intro (SFEED2): who wrote it, what drew it, whose voices are
 * in it and where the game's facts come from, filled by code from the
 * essay alone.
 */
export function gameEssayIntro(
  essay: GameEssay,
  voicing: Voicing = "owner"
): LockedIntro {
  const bites = bitesOf(essay)
  const aloud = bites.filter((bite) => bite.voice === "read-aloud").length
  const sample = voicing === "sample"
  const games = essay.games.length
  const of = `${bites.length} ${bites.length === 1 ? "bite" : "bites"} on ${games} ${games === 1 ? "game" : "games"}`
  return {
    rows: [
      {
        label: "Written by",
        says: sample
          ? "Claude, as the template's sample: the bites and the host's words are made up"
          : "Claude, from the week's bites and the plays home matched them to",
      },
      {
        label: "Drawn by",
        says: `Code: the Game Week essay's template, version ${essay.template.version}, in paulgsc/some-ui`,
      },
      {
        label: "Voices",
        says: sample
          ? "The host is Kokoro, a synthetic speaker, in a voice that changes with each game. In a sample, a second synthetic voice reads the made-up bites"
          : aloud === 0
            ? "The host is Kokoro, a synthetic speaker, in a voice that changes with each game. Every bite is the owner's own voice"
            : `The host is Kokoro, a synthetic speaker, in a voice that changes with each game. ${aloud} of ${bites.length} bites are the owner's words read by a second synthetic voice, where home heard them unclearly or the owner chose; the rest are the owner's own voice`,
      },
      {
        label: "The games",
        says: "ESPN's public play-by-play, read by home's scenario engine, drawn as one still per bite home matched to a play and never read out",
      },
      { label: "Said", says: of },
    ],
    said: [
      `This is the Game Week essay for ${essay.week.id}, ${sayDay(essay.week.from)} to ${sayDay(essay.week.to)}.`,
      "Claude wrote the host's words, and code drew every frame.",
      sample
        ? "This is a sample: every voice is synthetic, and one reads made-up bites."
        : aloud === 0
          ? "The host's voice is synthetic; every bite is the owner's own."
          : "The host's voice is synthetic; each bite is the owner's own voice, or the owner's words read by a second synthetic voice where marked.",
      "Each game is shown only where a bite was said about it, as one still of the play home matched it to.",
      sample ? `It covers ${of}.` : `The owner said ${of}.`,
    ].join(" "),
  }
}

/** The close's chapter title. */
const CLOSE_TITLE = "The week, closed"

/** A game's chapter title: "NE at CHI". */
const gameTitle = (game: GameEssay["games"][number]): string =>
  `${game.away} at ${game.home}`

/**
 * The essay's scenes in the order said: the intro and the brand, the open,
 * each game's group (its chapter slide and card, then each bite's setup,
 * the bite, what happened where said, and the host's answer, with
 * halftime between the first half and the second), then the close.
 */
export function gameEssayScenes(
  essay: GameEssay,
  voicing: Voicing = "owner"
): ReadonlyArray<GameEssayScene> {
  const shape = gameEssayFormat(essay.template.version).shape ?? SHAPE
  const scenes: Array<GameEssayScene> = [
    {
      section: "intro",
      id: "intro",
      speaker: "tutor",
      said: gameEssayIntro(essay, voicing).said,
    },
  ]
  if (shape.brand.intro)
    scenes.push({
      section: "brand-in",
      id: "brand-in",
      speaker: "tutor",
      said: "",
    })
  scenes.push({
    section: "open",
    id: "open",
    speaker: "tutor",
    said: essay.open.said,
  })
  const counts = new Map<Section, number>()
  const next = (section: Section): string => {
    const n = (counts.get(section) ?? 0) + 1
    counts.set(section, n)
    return repeatedId(section, n)
  }
  for (const game of essay.games) {
    const of = { game: game.id }
    if (shape.chapters.includes("game")) {
      const title = gameTitle(game)
      scenes.push({
        section: "chapter",
        id: repeatedId("chapter-game", (counts.get("game") ?? 0) + 1),
        of: "game",
        ...of,
        title,
        speaker: "tutor",
        said: `${title}.`,
      })
    }
    scenes.push({
      section: "game",
      id: next("game"),
      ...of,
      speaker: "tutor",
      said: game.game.said,
    })
    for (const half of game.halves) {
      if (half.half === "second" && game.halftime !== undefined)
        scenes.push({
          section: "halftime",
          id: next("halftime"),
          ...of,
          speaker: "tutor",
          said: game.halftime.said,
        })
      for (const bite of half.bites) {
        const at = { ...of, take: bite.take }
        scenes.push(
          {
            section: "setup",
            id: next("setup"),
            ...at,
            speaker: "tutor",
            said: bite.setup.said,
          },
          {
            section: "bite",
            id: next("bite"),
            ...at,
            speaker: "you",
            said: bite.transcript,
          }
        )
        if (bite.happened !== undefined)
          scenes.push({
            section: "happened",
            id: next("happened"),
            ...at,
            speaker: "tutor",
            said: bite.happened.said,
          })
        scenes.push({
          section: "answer",
          id: next("answer"),
          ...at,
          speaker: "tutor",
          said: bite.answer.said,
        })
      }
    }
  }
  if (shape.chapters.includes("close"))
    scenes.push({
      section: "chapter",
      id: "chapter-close",
      of: "close",
      title: CLOSE_TITLE,
      speaker: "tutor",
      said: `${CLOSE_TITLE}.`,
    })
  scenes.push({
    section: "close",
    id: "close",
    speaker: "tutor",
    said: essay.close.said,
  })
  if (shape.brand.outro)
    scenes.push({
      section: "brand-out",
      id: "brand-out",
      speaker: "tutor",
      said: "",
    })
  return scenes
}

/** The essay as a cut list the renderer draws, one still per scene, as its siblings'. */
export function gameEssayCutList(
  essay: GameEssay,
  takes: ReadonlyArray<StillTake | null>,
  {
    bed = false,
    voicing = "owner",
  }: { readonly bed?: boolean; readonly voicing?: Voicing } = {}
): CutList {
  const format = gameEssayFormat(essay.template.version)
  return stillsCutList(
    {
      title: `The Game Week essay, ${essay.week.id}`,
      series: format.series,
      look: "calm",
      captions: hasCaptions(format),
      bed,
      ...(format.shape ? { shape: format.shape } : {}),
    },
    gameEssayScenes(essay, voicing).map((s, i) => ({
      id: s.id,
      file: stillFile(i, s.id),
      said: s.said,
    })),
    takes
  )
}

/** Where the essay's chapters start (SFEED4): each game, and the close. */
export const gameEssayChapterMarks = (essay: GameEssay): Array<ChapterMark> =>
  chapterSlides(gameEssayScenes(essay).filter((s) => s.section === "chapter"))

/**
 * Which of `names`, the files in the folder home hands the recorder, is
 * each bite's take in the owner's voice, `<take>.<ext>`, with its word
 * times beside it where home kept them (`takeFilesOf`). A bite read aloud
 * plays no take of its own, so its file, if home hands it over, is set
 * aside. Keyed by those names.
 */
export const gameEssayTakeFiles = (
  essay: GameEssay,
  names: ReadonlyArray<string>
): Parsed<Readonly<Record<string, TakeFiles>>> => {
  const bites = bitesOf(essay)
  return takeFilesOf(
    {
      answered: bites.filter((b) => b.voice === "owner").map((b) => b.take),
      silent: [],
      unheard: bites.filter((b) => b.voice === "read-aloud").map((b) => b.take),
      noun: "bite",
    },
    names
  )
}

/**
 * The take a scene plays, by its name in the takes folder: a bite's in the
 * owner's own voice. A bite read aloud plays none: the second voice says
 * its words, as Kokoro says every scene with no take.
 */
export const gameTakeOf = (
  essay: GameEssay,
  scene: GameEssayScene
): string | null => {
  if (scene.section !== "bite" || scene.take === undefined) return null
  const bite = bitesOf(essay).find((b) => b.take === scene.take)
  return bite?.voice === "owner" ? bite.take : null
}
