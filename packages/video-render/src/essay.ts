/**
 * The Rust Rounds essay, the second template beside the weekly call
 * (`call.ts`; RR15, #2690): after a week's deadline, a video that answers it,
 * published to be rewatched. So it carries its own context: it restates the
 * week, each question and its speak-to points, and the rubric's whole scale,
 * and a rewatch needs nothing remembered.
 *
 * The essay's data (`EssaySchema`, `some-ui.rust-essay/1`) is its DNA with
 * the template: every word said and everything shown come from it, so the
 * video can always be made again from it. Every essay has the same scenes in
 * the same order (`essayFormat`); a ticket's scenes repeat as a group, one
 * group per ticket, in the week's order:
 *
 * 1. `open`: the week's company, story and SLA restated.
 * 2. For each ticket:
 *    - `question`: its spec and speak-to points;
 *    - `answer`: the owner's take, played whole and captioned with its
 *      transcript; for a ticket left unanswered, the silence and the guess
 *      at why; for a take home couldn't make out, a silence that says so
 *      (`./verdict`). From version 3 (`ESSAY_POINT_VERSION`, RR24) a
 *      speak-to point answered by a take of its own has an `answer` scene
 *      of its own after the ticket's (`points[j].answer`), and a ticket
 *      answered only point by point has none of the ticket's;
 *    - `best`: a best fit, an independent answer to each speak-to point,
 *      never called "correct";
 *    - `beside`: the best fit beside the owner's answer, each point covered,
 *      partly or missing, with the SOLO level and the whole scale;
 *    - `dive`, twice (K = `ESSAY_DIVES`; once for a ticket of one point):
 *      the biggest gaps, 2 to 5 minutes each; a point with no gap goes one
 *      step past the ticket.
 * 3. `weeks`: over the weeks, each concept's SOLO level per week, decay and
 *    fading, and the role line (#2694), all the decay record's derivation
 *    (RR19, `@some-ui/rust-rounds`' `lib/decay`).
 * 4. `next`: next week.
 *
 * The look is template A, the call (owner, 2026-11-07): two bubbles, the
 * tutor and the owner, the one speaking lit (`speaker`), the content beside
 * them, the caption underneath. The tutor's words are Kokoro's; the owner's
 * are their own take, so an answer scene's `said` is its transcript.
 *
 * The essay reaches the stage from home's store (ask #2684), through the
 * mailbox's `rust-essay` folder (RR18). Home's render worker records it from
 * the file it keeps, with the owner's takes beside it (RR16, www's
 * `record:essay`); with no essay named, the stage plays the sample
 * (`sampleEssay`), voiced as one (`Voicing`).
 */

import { z } from "zod"

import {
  CALL_ID,
  CALL_STAGE_WIDTH,
  day,
  nightInMotion,
  SaidSchema,
  sayDay,
} from "./call"
import type { LockedIntro } from "./call"
import type { ChapterMark } from "./chapters"
import { chapterSlides } from "./chapters"
import { once, problemsOf } from "./cut-list"
import type { CutList, Parsed } from "./cut-list"
import {
  FORMAT_SCHEMA,
  markThemeOf,
  repeatedId,
  versionRefusal,
  words,
} from "./format"
import type { Format, Shape } from "./format"
import { CONVERSATION_MOST } from "./opening"
import type { RegionRef, Screens } from "./screen"
import { regionRef } from "./screen"
import { hasCaptions, stillFile, stillsCutList } from "./stills"
import type { StillTake } from "./stills"
import { boardSceneOf, storyboardOf } from "./storyboard"
import type { Storyboard } from "./storyboard"
import { takeFilesOf } from "./take-files"
import type { TakeFiles } from "./take-files"
import sample from "./templates/rust-essay/sample-essay.json"
import {
  isSilenceShape,
  isUnheard,
  SILENCE_FIELDS,
  SILENCE_SHAPE,
  silenceSaid,
} from "./verdict"
import { ZOOM_STOPS_MOST, zoomPicture } from "./zoom"

export const ESSAY_SCHEMA = "some-ui.rust-essay/1"

/** The essay's template: its format's id. */
export const ESSAY_ID = "rust-essay"

/** The newest version `essayFormat` gives, pinned as `v<n>.json` under `templates/`. */
export const ESSAY_VERSION = 5

/**
 * The first version whose chart draws the decay record's two later cells
 * (RR19, #2695): a concept that may have faded, and an answer that came back
 * lower than an earlier week's. An essay with neither stays at version 1, so
 * a stage built before them still draws it (C270).
 */
export const ESSAY_DECAY_VERSION = 2

/**
 * The first version that draws a speak-to point answered by a take of its
 * own (RR24, #3248): `points[j].answer`, played in an answer scene of its
 * own. An essay with none stays at its version, so a stage built before
 * them still draws it.
 */
export const ESSAY_POINT_VERSION = 3

/** The first version that draws a point as a fork (`ForkSchema`) and takes 1 to 6 points. */
export const ESSAY_FORK_VERSION = 4

/**
 * The first version that opens on a conversation (#3269, C738): first after
 * the brand, a second voice asks each of the opening's questions, and the
 * owner's own take of their answer plays. An essay with none stays at its
 * version.
 */
export const ESSAY_OPENING_VERSION = 5

/**
 * The take that answers the opening's question `n` (from 1), by its id in
 * the folder home hands the recorder: `opening.<n>.<ext>`, the newest kept
 * take of that answer (C736), whatever week it was said in. A ticket's key
 * is capitals, so it never names a ticket's take.
 */
export const openingTakeId = (n: number): string => `opening.${n}`

/** The deep dives per ticket, on its biggest gaps: K (owner, 2026-11-07). */
export const ESSAY_DIVES = 2

/** The most tickets a week has (`some-ui.rust-week/1` and `/2`). */
const TICKETS_MOST = 4

/** The fewest and most speak-to points a ticket has (`some-ui.rust-week/1`'s `speakTo`). */
const POINTS_LEAST = 2
const POINTS_MOST = 3

/** The fewest and most points from version 4 (`ESSAY_FORK_VERSION`): a `/2` week's forks. */
const FORK_POINTS_LEAST = 1
const FORK_POINTS_MOST = 6

/** The most options an agent lists at a fork: `some-ui.rust-week/2`'s `OPTIONS_MAX`, which this package can't import. */
const OPTIONS_MOST = 6

/** The most weeks the chart shows, newest last. */
export const ESSAY_WEEKS_MOST = 12

/** The most concepts the chart shows. */
export const ESSAY_CONCEPTS_MOST = 12

/**
 * The most concept rows a routine's chart draws (RR19): what the stage's
 * frame holds at 1920×1080 on record beside the legend, three notes and the
 * role line, measured with `data-overflow`. The schema still reads up to
 * `ESSAY_CONCEPTS_MOST`.
 */
export const ESSAY_CHART_ROWS = 6

/**
 * SOLO's five levels, lowest first (Biggs & Collis, 1982): an answer's
 * `level` is its place here, from 1. The essay shows all five on every
 * comparison, so the level is read against the whole scale.
 */
export const SOLO_LEVELS = [
  "Prestructural",
  "Unistructural",
  "Multistructural",
  "Relational",
  "Extended abstract",
] as const

/** SOLO, as the essay cites it on screen. */
export const SOLO_SOURCE =
  "SOLO (Biggs & Collis, 1982), as applied to explaining code by Lister et al., ITiCSE 2006"

/**
 * The spacing scheme the decay record rechecks a concept on (RR19, C268):
 * the Leitner system (Leitner, 1972), five boxes whose intervals double, in
 * weeks. The chart cites it as it cites SOLO.
 */
export const LEITNER = {
  name: "The Leitner system",
  source: "Leitner, 1972",
  weeks: [1, 2, 4, 8, 16],
} as const

/** How a speak-to point of the owner's answer stands beside the best fit. */
export const MARKS = ["covered", "partly", "missing"] as const
export type Mark = (typeof MARKS)[number]

type Section =
  | "ask"
  | "opening"
  | "open"
  | "question"
  | "answer"
  | "best"
  | "beside"
  | "fork"
  | "dive"
  | "weeks"
  | "next"

type Repeated = Exclude<Section, "open" | "weeks" | "next">

/** The scenes a shape adds: the locked intro, the brand intro and outro, and a chapter slide. */
type Framing = "intro" | "brand-in" | "chapter" | "brand-out"

/**
 * How many of each repeated scene an essay of template `version` can have:
 * from version 3 a ticket's answer scenes are its own and one per point
 * answered on its own (`ESSAY_POINT_VERSION`).
 */
const essayMost = (version: number): Readonly<Record<Repeated, number>> => {
  const points = version >= ESSAY_FORK_VERSION ? FORK_POINTS_MOST : POINTS_MOST
  return {
    ask: CONVERSATION_MOST,
    opening: CONVERSATION_MOST,
    question: TICKETS_MOST,
    answer:
      version >= ESSAY_POINT_VERSION
        ? TICKETS_MOST * (1 + points)
        : TICKETS_MOST,
    best: TICKETS_MOST,
    beside: TICKETS_MOST,
    fork: TICKETS_MOST * FORK_POINTS_MOST,
    dive: TICKETS_MOST * ESSAY_DIVES,
  }
}

const isRepeated = (section: Section): section is Repeated =>
  section in essayMost(ESSAY_VERSION)

const scene = (
  version: number,
  id: Section,
  name: string,
  point: string,
  holdMs: number
): Format["scenes"][number] => ({
  id,
  name,
  point,
  picture: {
    kind: "capture",
    from: `the essay's ${id} view`,
    cssWidth: CALL_STAGE_WIDTH,
  },
  holdMs,
  ...(isRepeated(id) ? { repeat: { max: essayMost(version)[id] } } : {}),
})

/**
 * The essay's shape: the call's from its version 4 (`call.ts`), Mochi Night
 * with the moving brand intro and outro, and a chapter slide opening each
 * ticket and the close, so the essay can be listened to.
 */
const ESSAY_SHAPE: Shape = nightInMotion({
  brand: { intro: true, outro: true },
  chapters: ["question", "weeks"],
  subtitles: "word",
})

/** Why `version` of the essay's template can't be drawn here, or null (VS1). */
export const essayVersionRefusal = (version: number): string | null =>
  versionRefusal("the essay's template", ESSAY_VERSION, version)

/**
 * The essay's format at `version`: its scenes in the order a ticket's are
 * said, each repeated scene once per ticket (`dive` up to twice). Throws for a
 * version this build doesn't know (`essayVersionRefusal`).
 */
export function essayFormat(version: number = ESSAY_VERSION): Format {
  const refused = essayVersionRefusal(version)
  if (refused !== null) throw new Error(refused)
  return {
    schema: FORMAT_SCHEMA,
    id: ESSAY_ID,
    version,
    title: "The Rust Rounds essay",
    // Drawn in the call's series: its frame, captions and music bed.
    series: { id: CALL_ID, version: 2 },
    look: "calm",
    scenes: [
      ...(version >= ESSAY_OPENING_VERSION
        ? [
            scene(
              version,
              "ask",
              "They ask",
              "A question someone who has never seen Rust Rounds would ask, in a second synthetic voice",
              10_000
            ),
            scene(
              version,
              "opening",
              "You answer",
              "The newest take of the answer, played whole; left out when there is none to play",
              90_000
            ),
          ]
        : []),
      scene(
        version,
        "open",
        "The week",
        "The company, its story and the SLA the tickets answer to",
        40_000
      ),
      scene(
        version,
        "question",
        "The question",
        "What the ticket asked, and what to speak to",
        40_000
      ),
      scene(
        version,
        "answer",
        "Your answer",
        version >= ESSAY_POINT_VERSION
          ? "Your take, played whole, or a point's own take; or the silence, and a guess at why"
          : "Your take, played whole; or the silence, and a guess at why",
        45_000
      ),
      scene(
        version,
        "best",
        "A best fit",
        "An answer to each speak-to point, made apart from yours",
        60_000
      ),
      scene(
        version,
        "beside",
        "The best fit beside yours",
        "Each point covered, partly or missing, and where that sits on SOLO",
        50_000
      ),
      ...(version >= ESSAY_FORK_VERSION
        ? [
            scene(
              version,
              "fork",
              "The fork",
              "Every option, the best one too if it wasn't listed, against the week's stated constraints; and where your decision sits between A and A′",
              60_000
            ),
          ]
        : []),
      scene(
        version,
        "dive",
        "A deep dive",
        "One of the biggest gaps, from the ground up, or one step past the ticket",
        180_000
      ),
      scene(
        version,
        "weeks",
        "Over the weeks",
        version >= ESSAY_DECAY_VERSION
          ? "Each concept across the weeks: shown, not met yet, met but not yet known, decayed, may have faded, or not answered; when each is due a recheck; and the role it fits"
          : "Each concept across the weeks, never known apart from decayed, and the role it fits",
        70_000
      ),
      scene(
        version,
        "next",
        "Next week",
        "What next week comes back to",
        20_000
      ),
    ],
    shape: ESSAY_SHAPE,
  }
}

/** A week's id, as `some-ui.rust-week/1` and `/2` write it (`@some-ui/rust-rounds`' `WEEK_ID`); the interview essay's too. */
export const weekId = z
  .string()
  .regex(/^\d{4}-w(?:0[1-9]|[1-4]\d|5[0-3])$/, "a week's id is like 2026-w46")

/** A ticket's key, as `some-ui.rust-week/1` and `/2` write it (`TICKET_KEY`), unanchored. */
export const TICKET_KEY_PATTERN = "[A-Z][A-Z0-9]{0,5}-\\d{1,6}"

const ticketKey = z
  .string()
  .regex(
    new RegExp(`^${TICKET_KEY_PATTERN}$`),
    "a ticket's id is a key like QM-311"
  )

/** A program or snippet, shown as written: never only spaces. */
const code = z.string().refine((s) => s.trim().length > 0, "it is empty")

const SoloSchema = z.strictObject({
  /** Its place on `SOLO_LEVELS`, from 1. */
  level: z.number().int().min(1).max(SOLO_LEVELS.length),
  /** Why the answer reads at that level, in a sentence. */
  why: words,
})

/** How a speak-to point of a take stands beside the best fit. */
const PointMarkSchema = z.strictObject({
  mark: z.enum(MARKS),
  note: words.optional(),
})

const SilenceSchema = z.strictObject({
  ...SILENCE_FIELDS,
  /** How many times the ticket was opened and nothing sent. */
  opened: z.number().int().nonnegative(),
})

/**
 * A ticket's answer: a take of the whole ticket, or a silence. A ticket
 * answered only point by point (RR24) has no take of the whole ticket, so
 * its answer is a silence with neither a guess nor `unheard`: nothing is
 * said over it, and it has no scene (`byPointsOnly`; `ticketProblems`
 * holds that every point then has an answer of its own).
 */
const AnswerSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("take"),
    /** What the owner said, as home heard it: the answer scene's caption. */
    transcript: words,
    /** Each speak-to point, in order, as it stands beside the best fit. */
    marks: z.array(PointMarkSchema),
    solo: SoloSchema,
  }),
  SilenceSchema.refine(
    (silence) => !(silence.unheard === true && silence.guess !== undefined),
    SILENCE_SHAPE
  ),
])

/**
 * A speak-to point's answer by a take of its own (RR24, #3248), its ref
 * `<week>:<ticket>:<n>` and its file `<ticket>.<n>.<ext>` (`pointTakeId`):
 * the take, its transcript, its one mark and its SOLO level; or, for a take
 * in which home heard nothing said or couldn't make out, a silence. It
 * answers its point in place of the ticket's.
 */
const PointAnswerSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("take"),
    transcript: words,
    /** The point, as it stands beside the best fit. */
    mark: PointMarkSchema,
    solo: SoloSchema,
  }),
  SilenceSchema.refine(isSilenceShape, SILENCE_SHAPE),
])

const DiveSchema = z.strictObject({
  /** The speak-to point it goes into, by its place in `points`, from 0. */
  point: z.number().int().nonnegative(),
  title: words,
  /** What the frame lists while it is said. */
  shows: z.array(words).min(1).max(5),
  code: code.optional(),
  said: words,
})

/** A stated constraint's id, as `some-ui.rust-week/2` writes it: `S1` for an SLA row, `F1` for a figure (C696). */
const constraintId = z
  .string()
  .regex(/^[SF][1-9]\d*$/, "a stated constraint's id is like S1 or F2")

const ModelSchema = z.strictObject({ id: words, name: words })

/**
 * Which stated constraints a decision meets and which it breaks, by id; or,
 * for one whose program rustc refuses, that it doesn't build, with rustc's
 * code and why, and nothing met or broken.
 */
const TradeFields = {
  meets: z.array(constraintId),
  breaks: z.array(constraintId),
  /** Why, in a few words, as the table's last column says it; a refused one shows `refused.why` there instead. */
  because: words.optional(),
  refused: z.strictObject({ code: words, why: words }).optional(),
}

/** A listed option, by its id. */
const OptionPickSchema = z.strictObject({
  kind: z.literal("option"),
  option: z.string(),
})

/**
 * Where a decision sits between A, the naive judge whose only rational
 * choice is the recommended one, and A′, the astute observer who has the
 * words to decide, and may see past the list (RR29, owner 2026-11-19),
 * A first.
 */
export const FORK_PLACEMENTS = [
  "trusted",
  "reasoned",
  "departed",
  "own",
  "astute",
] as const
export type ForkPlacement = (typeof FORK_PLACEMENTS)[number]

/** How the owner's decision stands beside the best one. */
export const FORK_VERDICTS = ["best", "close", "off"] as const
export type ForkVerdict = (typeof FORK_VERDICTS)[number]

/**
 * The owner's decision at a fork (C693): a listed option, by id; their own,
 * as they said it; or, for a fork left alone, the recommended one by
 * default, kept apart from a pick of it.
 */
const DecisionSchema = z.discriminatedUnion("kind", [
  OptionPickSchema,
  z.strictObject({ kind: z.literal("own"), decision: words }),
  z.strictObject({ kind: z.literal("recommended-by-default") }),
])

/**
 * A point as a fork (version 4, RR29, #3257; C697): the options an agent
 * listed, each against the week's stated constraints by id; the best
 * decision, a listed option or a hidden one not on the list, as the
 * after-deadline best fit names it; what is said over its `fork` scene;
 * and, once the owner's decision is on record (RR28), the decision, the
 * verdict on it and its place between A and A′.
 */
const ForkSchema = z.strictObject({
  options: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[A-F]$/, "an option's id is a capital, A to F"),
        recommended: z.boolean(),
        decision: words,
        model: ModelSchema,
        ...TradeFields,
      })
    )
    .min(2)
    .max(OPTIONS_MOST),
  best: z.discriminatedUnion("kind", [
    OptionPickSchema,
    z.strictObject({
      kind: z.literal("hidden"),
      decision: words,
      why: words,
      model: ModelSchema,
      ...TradeFields,
    }),
  ]),
  said: words,
  judged: z
    .strictObject({
      decision: DecisionSchema,
      verdict: z.strictObject({ kind: z.enum(FORK_VERDICTS), why: words }),
      placement: z.enum(FORK_PLACEMENTS),
    })
    .optional(),
})

const TicketSchema = z.strictObject({
  id: ticketKey,
  title: words,
  spec: words,
  /** The figures the scenario stated as given; never measured. */
  figures: z.array(words),
  program: code,
  /**
   * The speak-to points in order, each with the best fit's answer to it, and
   * its own answer when a take of its own answered it (version 3).
   */
  points: z
    .array(
      z.strictObject({
        to: words,
        best: words,
        answer: PointAnswerSchema.optional(),
        fork: ForkSchema.optional(),
      })
    )
    .min(FORK_POINTS_LEAST)
    .max(FORK_POINTS_MOST),
  /**
   * The constraints the week stated that its forks trade on, by id (the SLA's
   * rows and the ticket's figures), as the fork scene's columns name them.
   */
  stated: z.array(z.strictObject({ id: constraintId, says: words })).optional(),
  answer: AnswerSchema,
  question: SaidSchema,
  best: SaidSchema,
  beside: SaidSchema,
  /** `ESSAY_DIVES`, or one for a ticket of one point (version 4). */
  dives: z.array(DiveSchema).min(1).max(ESSAY_DIVES),
})

const soloLevel = z.number().int().min(1).max(SOLO_LEVELS.length)

/**
 * A concept's cell for one week, as the decay record (RR19) reads it: the
 * SOLO level shown; an answer lower than the level shown in week `below`
 * (decay, observed); not met; not answered; or `faded`, not checked since it
 * was shown and past its recheck (presumed). `below` and `faded` are
 * version 2's (`ESSAY_DECAY_VERSION`).
 */
const CellSchema = z.union([
  soloLevel,
  z.strictObject({ level: soloLevel, below: weekId }),
  z.literal("unmet"),
  z.literal("silent"),
  z.literal("faded"),
])

export const EssaySchema = z.strictObject({
  schema: z.literal(ESSAY_SCHEMA),
  template: z.strictObject({
    id: z.literal(ESSAY_ID),
    version: z
      .number()
      .int()
      .min(1)
      .max(ESSAY_VERSION, {
        message: `newer than this build knows: it draws up to version ${ESSAY_VERSION}, so publish a newer stage first`,
      }),
  }),
  /** The week it answers: its id and days, both included. */
  week: z.strictObject({ id: weekId, from: day, to: day }),
  company: z.strictObject({ name: words, about: words }),
  story: words,
  sla: z.array(z.strictObject({ what: words, target: words })).min(1),
  /** The references the week was checked against, by their full names. */
  references: z.array(words).min(1),
  /**
   * The opening conversation (#3269, C738): each question asked and what
   * home heard in the owner's newest take of its answer, by the question's
   * place in the week's opening (from 1), in order, with that take's voice
   * note id (C736). Absent when no answer has a take to play; a question
   * whose answer has none is left out.
   */
  opening: z
    .strictObject({
      exchanges: z
        .array(
          z.strictObject({
            n: z.int().min(1).max(CONVERSATION_MOST),
            ask: words,
            transcript: words,
            take: z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/),
          })
        )
        .min(1)
        .max(CONVERSATION_MOST),
    })
    .optional(),
  open: SaidSchema,
  tickets: z.array(TicketSchema).min(2).max(TICKETS_MOST),
  weeks: z.strictObject({
    said: words,
    /** The weeks the chart shows, oldest first, this essay's last. */
    weeks: z.array(weekId).min(1).max(ESSAY_WEEKS_MOST),
    concepts: z
      .array(
        z.strictObject({
          name: words,
          /** One cell per week of `weeks`. */
          cells: z.array(CellSchema),
        })
      )
      .min(1)
      .max(ESSAY_CONCEPTS_MOST),
    /** The role line (#2694): the role fitted on a published ladder, and the gap to the next. */
    role: z.strictObject({
      ladder: words,
      /** Where the ladder is published, as the frame cites it. */
      source: words,
      fits: words,
      next: words,
      gap: words,
    }),
  }),
  next: z.strictObject({ said: words, week: weekId, topics: z.array(words) }),
})

export type Essay = z.infer<typeof EssaySchema>
export type EssayTicket = Essay["tickets"][number]
export type EssayDive = EssayTicket["dives"][number]
export type EssayCell = Essay["weeks"]["concepts"][number]["cells"][number]
export type EssayFork = NonNullable<EssayTicket["points"][number]["fork"]>
export type EssayPointAnswer = NonNullable<
  EssayTicket["points"][number]["answer"]
>

/**
 * A point's take's id in the folder home hands the recorder, less its
 * extension: `QM-311.2` for point 2 (from 1), as home names it
 * (paulgsc/server `essay::point_key`, RR24).
 */
export const pointTakeId = (ticket: string, point: number): string =>
  `${ticket}.${point}`

/** Whether `ticket` was answered only point by point: no take or silence of the whole ticket is said. */
export const byPointsOnly = (ticket: EssayTicket): boolean =>
  ticket.answer.kind === "silence" &&
  ticket.answer.guess === undefined &&
  ticket.answer.unheard !== true

/** Whether any of `ticket`'s points was answered by a take of its own. */
export const hasPointAnswers = (ticket: EssayTicket): boolean =>
  ticket.points.some((point) => point.answer !== undefined)

/**
 * What answers point `point` (from 0) of `ticket`: its own answer, where a
 * take of its own answered it (`own`), or else the ticket's (`whole`), and
 * the mark it stands at beside the best fit, if one was given.
 */
export function pointAnsweredBy(
  ticket: EssayTicket,
  point: number
):
  | { readonly by: "own"; readonly answer: EssayPointAnswer }
  | { readonly by: "whole"; readonly answer: EssayTicket["answer"] } {
  const own = ticket.points[point]?.answer
  return own === undefined
    ? { by: "whole", answer: ticket.answer }
    : { by: "own", answer: own }
}

/**
 * Which take the beside table cites under point `point` (from 0) of
 * `ticket` (RR24): `own` for a point answered by a take of its own, `whole`
 * for one the ticket's take answers; null when the ticket has no point
 * answered on its own, so its table reads as before, and for a point left
 * to the ticket's silence.
 */
export function citeOf(
  ticket: EssayTicket,
  point: number
): "own" | "whole" | null {
  if (!hasPointAnswers(ticket)) return null
  const answered = pointAnsweredBy(ticket, point)
  return answered.by === "own"
    ? "own"
    : answered.answer.kind === "take"
      ? "whole"
      : null
}

/** The mark point `point` (from 0) of `ticket` stands at, from what answers it; none for a silence. */
export function markOf(
  ticket: EssayTicket,
  point: number
): z.infer<typeof PointMarkSchema> | undefined {
  const answered = pointAnsweredBy(ticket, point)
  if (answered.answer.kind === "silence") return undefined
  return answered.by === "own"
    ? answered.answer.mark
    : answered.answer.marks[point]
}

/** Whether `cell` is one only version 2 of the template draws (`ESSAY_DECAY_VERSION`). */
export const needsDecayVersion = (cell: EssayCell): boolean =>
  cell === "faded" || typeof cell === "object"

/**
 * How big a point's gap is: missing, partly, covered, from what answers it
 * (`pointAnsweredBy`); every point of a silence is missing.
 */
const gapOf = (ticket: EssayTicket, point: number): number => {
  const mark = markOf(ticket, point)?.mark
  return mark === undefined || mark === "missing"
    ? 2
    : mark === "partly"
      ? 1
      : 0
}

/** Whether dive `dive` of `ticket` goes past it: into a point the answer covered. */
export const isPast = (ticket: EssayTicket, dive: EssayDive): boolean =>
  gapOf(ticket, dive.point) === 0

type Trade = {
  readonly id: string
  readonly meets: ReadonlyArray<string>
  readonly breaks: ReadonlyArray<string>
  readonly because?: string
  readonly refused?: unknown
}

/** Every decision's trade at `fork`: each listed option's, and the hidden best's, as `hidden`. */
const tradesOf = (fork: EssayFork): Array<Trade> => [
  ...fork.options,
  ...(fork.best.kind === "hidden" ? [{ ...fork.best, id: "hidden" }] : []),
]

/**
 * Whether `hidden` is better than `option` on what the week stated: it
 * builds where `option` doesn't, meets an id `option` doesn't meet, or
 * avoids an id `option` breaks.
 */
const betterOnStated = (hidden: Trade, option: Trade): boolean =>
  hidden.refused === undefined &&
  (option.refused !== undefined ||
    hidden.meets.some((id) => !option.meets.includes(id)) ||
    option.breaks.some((id) => !hidden.breaks.includes(id)))

/**
 * The listed option the owner's decision at `fork` picked: by id, or the
 * recommended one for a fork left alone; none for their own, or before the
 * decision is on record.
 */
export function pickedOf(
  fork: EssayFork
): EssayFork["options"][number] | undefined {
  const decision = fork.judged?.decision
  return decision?.kind === "option"
    ? fork.options.find((option) => option.id === decision.option)
    : decision?.kind === "recommended-by-default"
      ? fork.options.find((option) => option.recommended)
      : undefined
}

/** Why fork `at` contradicts itself or what the week stated (`stated`, the ids it gave). */
export function forkProblems(
  fork: EssayFork,
  stated: ReadonlySet<string>,
  at: string
): Array<string> {
  const problems: Array<string> = []
  const recommended = fork.options.filter((option) => option.recommended)
  if (recommended.length !== 1)
    problems.push(
      `${at}: ${recommended.length} options are recommended; exactly one is`
    )
  const ids = fork.options.map((option) => option.id)
  if (new Set(ids).size !== ids.length)
    problems.push(`${at}: two options share an id`)
  for (const trade of tradesOf(fork)) {
    const named = trade.id === "hidden" ? "the hidden best" : trade.id
    for (const id of [...trade.meets, ...trade.breaks])
      if (!stated.has(id))
        problems.push(
          `${at}: ${named} names ${id}, which the week doesn't state`
        )
    if (trade.meets.some((id) => trade.breaks.includes(id)))
      problems.push(`${at}: ${named} both meets and breaks a constraint`)
    if (trade.refused === undefined && trade.because === undefined)
      problems.push(`${at}: ${named} says nothing of why, in a few words`)
    if (
      trade.refused !== undefined &&
      trade.meets.length + trade.breaks.length > 0
    )
      problems.push(
        `${at}: ${named} doesn't build, so it meets and breaks nothing`
      )
  }
  const best = fork.best
  if (best.kind === "option" && !ids.includes(best.option))
    problems.push(`${at}: the best is ${best.option}, which isn't listed`)
  if (best.kind === "hidden")
    for (const option of fork.options)
      if (!betterOnStated({ ...best, id: "hidden" }, option))
        problems.push(
          `${at}: the hidden best is no better than ${option.id} on any stated constraint, so its advantage over ${option.id} isn't stated`
        )
  const judged = fork.judged
  if (judged === undefined) return problems
  const { decision, verdict, placement } = judged
  const picked = pickedOf(fork)
  if (decision.kind === "option" && picked === undefined)
    problems.push(
      `${at}: the decision is ${decision.option}, which isn't listed`
    )
  const fits: Readonly<Record<ForkPlacement, boolean>> = {
    trusted: decision.kind === "recommended-by-default",
    reasoned: decision.kind === "option" && picked?.recommended === true,
    departed: decision.kind === "option" && picked?.recommended === false,
    own: decision.kind === "own",
    astute: decision.kind === "own",
  }
  if (!fits[placement])
    problems.push(
      `${at}: a ${decision.kind} decision isn't placed ${placement}`
    )
  if (
    decision.kind === "own" &&
    best.kind === "option" &&
    verdict.kind === "best"
  )
    problems.push(
      `${at}: the verdict says best, and the best is the listed ${best.option}, not their own`
    )
  if (picked !== undefined) {
    const isBest = best.kind === "option" && best.option === picked.id
    if (isBest !== (verdict.kind === "best"))
      problems.push(
        `${at}: the verdict says ${verdict.kind}, and the decision ${isBest ? "is" : "isn't"} the best`
      )
  }
  return problems
}

/** Whether `ticket` is drawn only from version 4: a fork, or a point count outside 2 to 3. */
export const needsForkVersion = (ticket: EssayTicket): boolean =>
  ticket.points.some((point) => point.fork !== undefined) ||
  ticket.points.length < POINTS_LEAST ||
  ticket.points.length > POINTS_MOST

function ticketProblems(ticket: EssayTicket, version: number): Array<string> {
  const problems: Array<string> = []
  const points = ticket.points.length
  const forks = ticket.points.flatMap((point, j) =>
    point.fork === undefined ? [] : [{ fork: point.fork, n: j + 1 }]
  )
  if (version < ESSAY_FORK_VERSION && needsForkVersion(ticket))
    problems.push(
      `${ticket.id}: a fork, or ${FORK_POINTS_LEAST} to ${FORK_POINTS_MOST} points, is drawn from version ${ESSAY_FORK_VERSION} of the template`
    )
  if (forks.length > 0 && ticket.stated === undefined)
    problems.push(
      `${ticket.id}: its forks trade on stated constraints, and it names none`
    )
  const stated = new Set((ticket.stated ?? []).map((row) => row.id))
  if (stated.size !== (ticket.stated ?? []).length)
    problems.push(`${ticket.id}: a stated constraint's id repeats`)
  for (const { fork, n } of forks)
    problems.push(...forkProblems(fork, stated, `${ticket.id} fork ${n}`))
  if (hasPointAnswers(ticket) && version < ESSAY_POINT_VERSION)
    problems.push(
      `${ticket.id}: a point answered by a take of its own is drawn from version ${ESSAY_POINT_VERSION} of the template`
    )
  if (byPointsOnly(ticket) && !ticket.points.every((p) => p.answer))
    problems.push(
      `${ticket.id}: its silence carries no guess at why, and a point has no answer of its own`
    )
  if (ticket.answer.kind === "take" && ticket.answer.marks.length !== points)
    problems.push(
      `${ticket.id}: its answer marks ${ticket.answer.marks.length} points, and it has ${points}`
    )
  const dives = Math.min(ESSAY_DIVES, points)
  if (ticket.dives.length !== dives)
    problems.push(
      `${ticket.id}: it has ${ticket.dives.length} deep dives; its points take ${dives}`
    )
  const dived = ticket.dives.map((dive) => dive.point)
  if (dived.some((point) => point >= points))
    problems.push(`${ticket.id}: a deep dive goes into a point it doesn't have`)
  if (new Set(dived).size !== dived.length)
    problems.push(`${ticket.id}: two deep dives go into the same point`)
  // K dives go into the K biggest gaps: no point left out has a bigger one.
  const least = Math.min(...dived.map((point) => gapOf(ticket, point)))
  for (let point = 0; point < points; point++)
    if (!dived.includes(point) && gapOf(ticket, point) > least)
      problems.push(
        `${ticket.id}: point ${point + 1} has a bigger gap than a deep dive's, and no deep dive`
      )
  return problems
}

/**
 * Why an essay's chart weeks and next week don't fit the week it answers:
 * the chart ends on it, oldest first, each once, and next week comes after.
 * Both essays' checkers say these the same way (`interview-essay.ts`).
 */
export function chartWeeksProblems(
  week: string,
  weeks: ReadonlyArray<string>
): Array<string> {
  const problems: Array<string> = []
  if (weeks.at(-1) !== week)
    problems.push(`weeks: the chart doesn't end on ${week}`)
  if (weeks.some((each, i) => i > 0 && each <= (weeks[i - 1] ?? "")))
    problems.push("weeks: they aren't oldest first, each once")
  return problems
}

export const nextWeekProblems = (week: string, next: string): Array<string> =>
  next <= week ? [`next: ${next} doesn't come after ${week}`] : []

/** Every reason the essay's parsed data contradicts itself. */
function essayProblems(essay: Essay): Array<string> {
  const problems: Array<string> = []
  if (essay.week.to < essay.week.from)
    problems.push("week: it ends before it starts")
  const ids = essay.tickets.map((ticket) => ticket.id)
  if (new Set(ids).size !== ids.length)
    problems.push("tickets: two share an id")
  for (const ticket of essay.tickets)
    problems.push(...ticketProblems(ticket, essay.template.version))
  const { weeks, concepts } = essay.weeks
  problems.push(...chartWeeksProblems(essay.week.id, weeks))
  for (const concept of concepts) {
    if (concept.cells.length !== weeks.length)
      problems.push(
        `${concept.name}: it has ${concept.cells.length} cells for ${weeks.length} weeks`
      )
    concept.cells.forEach((cell, i) => {
      if (!needsDecayVersion(cell)) return
      if (essay.template.version < ESSAY_DECAY_VERSION)
        problems.push(
          `${concept.name}: decay and fading are drawn from version ${ESSAY_DECAY_VERSION} of the template`
        )
      const week = weeks[i]
      if (typeof cell === "object" && week !== undefined && cell.below >= week)
        problems.push(
          `${concept.name}: in ${week} it came back lower than ${cell.below}, which isn't earlier`
        )
    })
  }
  problems.push(...nextWeekProblems(essay.week.id, essay.next.week))
  if (essay.opening !== undefined) {
    if (essay.template.version < ESSAY_OPENING_VERSION)
      problems.push(
        `opening: the template plays the owner's opening from version ${ESSAY_OPENING_VERSION}`
      )
    const ns = essay.opening.exchanges.map((e) => e.n)
    if (ns.some((n, i) => i > 0 && n <= (ns[i - 1] ?? 0)))
      problems.push(
        `opening.exchanges: each question once, in the opening's order; got ${ns.join(", ")}`
      )
  }
  return once(problems)
}

/** The essay's data, or every reason it can't make an essay. */
export function parseEssay(raw: unknown): Parsed<Essay> {
  const parsed = EssaySchema.safeParse(raw)
  if (!parsed.success)
    return { ok: false, problems: problemsOf(parsed.error, "essay") }
  const problems = essayProblems(parsed.data)
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, value: parsed.data }
}

/** The template's sample essay: Quillmoss's week 46, two tickets answered and one not. */
export const sampleEssay = (): Parsed<Essay> => parseEssay(sample)

/** Who is speaking, and so whose bubble is lit: the opening's questions are the asker's. */
export type Speaker = "tutor" | "you" | "asker"

/**
 * Whose voice says the owner's answers: their own takes, in an essay home
 * renders; or, in the template's sample (its storyboard, its preview, the
 * stage with no essay named), a second synthetic voice, since no owner said
 * the sample's answers (C76). The locked intro says which.
 */
export type Voicing = "owner" | "sample"

/**
 * Each speaker's Kokoro voice, as the call's `CALL_VOICES`; `you` only in
 * the sample (`Voicing`). The asker's is neither the tutor's nor the
 * sample's, so a listener hears the opening's questions come from someone
 * else (owner, 2026-11-19).
 */
export const ESSAY_VOICES: Readonly<Record<Speaker, string>> = {
  tutor: "am_michael",
  you: "bm_george",
  asker: "af_heart",
}

/** One scene of an essay: its section, its id in the video, who says it and what. */
export type EssayScene =
  | {
      readonly section: Exclude<Section | Framing, "chapter">
      /** Its section's id, or `<section>-<n>` for a repeated one's nth. */
      readonly id: string
      /** The ticket it belongs to, by its key. */
      readonly ticket?: string
      /** The deep dive it is, by its place in the ticket's, from 0. */
      readonly dive?: number
      /**
       * For an answer scene of a point answered by a take of its own (RR24),
       * or a fork scene (RR29), the point, by its place in the ticket's,
       * from 0.
       */
      readonly point?: number
      /** For an opening's question or answer, the question's place in the opening, from 1. */
      readonly exchange?: number
      readonly speaker: Speaker
      /** What is said over it; empty for a brand slide. */
      readonly said: string
    }
  | {
      readonly section: "chapter"
      readonly id: string
      /** The scene the chapter slide opens. */
      readonly of: Section
      /** The ticket it opens, by its key, for a chapter before a question. */
      readonly ticket?: string
      /** The chapter's title, shown and said. */
      readonly title: string
      readonly speaker: Speaker
      readonly said: string
    }

/** Each section's title on a chapter slide that isn't a ticket's. */
export const ESSAY_CHAPTERS: Readonly<Record<"weeks" | "next", string>> = {
  weeks: "Over the weeks",
  next: "Next week",
}

/** How many of the essay's tickets the owner answered: whole, or any point by a take of its own. */
export const answeredOf = (essay: Essay): number =>
  essay.tickets.filter(
    (ticket) =>
      ticket.answer.kind === "take" ||
      ticket.points.some((point) => point.answer?.kind === "take")
  ).length

/**
 * The locked intro (SFEED2), as the call's is: who wrote the essay, what
 * drew it, whose voices are in it and what judges it, each a row on the
 * frame and all of it said. Filled by code from the essay alone, never by
 * the routine that writes it.
 */
export function essayIntro(
  essay: Essay,
  voicing: Voicing = "owner"
): LockedIntro {
  const answered = answeredOf(essay)
  const of = `${answered} of ${essay.tickets.length} tickets`
  const sample = voicing === "sample"
  return {
    rows: [
      {
        label: "Written by",
        says: sample
          ? "Claude, as the template's sample: the week and its answers are made up"
          : "Claude, from the week's exercise and the owner's takes",
      },
      {
        label: "Drawn by",
        says: `Code: the Rust Rounds essay's template, version ${essay.template.version}, in paulgsc/some-ui`,
      },
      {
        label: "Voices",
        says: essayVoices(sample, essay.opening !== undefined),
      },
      { label: "Judged by", says: SOLO_SOURCE },
      { label: "Checked against", says: essay.references.join(" · ") },
      { label: "Answered", says: of },
    ],
    said: [
      `This is the Rust Rounds essay for ${essay.week.id}, ${sayDay(essay.week.from)} to ${sayDay(essay.week.to)}.`,
      "Claude wrote the tutor's words, and code drew every frame.",
      sample
        ? essay.opening === undefined
          ? "This is a sample: both voices are synthetic, and the second reads made-up answers."
          : "This is a sample: every voice is synthetic, the one asking the opening's questions too, and one reads made-up answers."
        : essay.opening === undefined
          ? "The tutor's voice is synthetic; the other voice is the owner's own."
          : "The tutor's voice and the one asking the opening's questions are synthetic; the answers are the owner's own.",
      sample ? `Its answers cover ${of}.` : `The owner answered ${of}.`,
    ].join(" "),
  }
}

/**
 * The intro's "Voices" row: who says what, for the sample (every voice
 * synthetic) or an essay home renders, with the opening's asker when it
 * opens on the conversation (#3269).
 */
function essayVoices(sample: boolean, opened: boolean): string {
  if (!opened)
    return sample
      ? "Both are Kokoro, a synthetic speaker. In a sample, a second synthetic voice reads the answers"
      : "The tutor is Kokoro, a synthetic speaker. The other voice is the owner's own, from their takes"
  return `The tutor is Kokoro, a synthetic speaker, and so is the one asking the opening's questions, in a voice of its own. ${
    sample
      ? "In a sample, a third synthetic voice reads the answers"
      : "The answers are the owner's own voice, from their takes"
  }`
}

/** An answer scene's words and voice: a take's transcript in the owner's, a silence's in the tutor's. */
const answerSaid = (
  answer: EssayTicket["answer"] | EssayPointAnswer
): { readonly speaker: Speaker; readonly said: string } =>
  answer.kind === "take"
    ? { speaker: "you", said: answer.transcript }
    : { speaker: "tutor", said: silenceSaid(answer) }

/**
 * The essay's scenes in the order said. In each ticket: its chapter slide,
 * the question, the answer (the whole ticket's, unless it was answered only
 * point by point, then each point's answered by a take of its own, in
 * order), a best fit, the two beside each other, then its deep dives. Answer
 * scenes are numbered across the essay, as deep dives are. The locked intro and the brand intro open it, a chapter slide
 * opens each ticket and the close's sections, and the brand outro ends it.
 */
export function essayScenes(
  essay: Essay,
  voicing: Voicing = "owner"
): ReadonlyArray<EssayScene> {
  const shape = essayFormat(essay.template.version).shape ?? ESSAY_SHAPE
  const scenes: Array<EssayScene> = [
    {
      section: "intro",
      id: "intro",
      speaker: "tutor",
      said: essayIntro(essay, voicing).said,
    },
  ]
  if (shape.brand.intro)
    scenes.push({
      section: "brand-in",
      id: "brand-in",
      speaker: "tutor",
      said: "",
    })
  for (const { n, ask, transcript } of essay.opening?.exchanges ?? [])
    scenes.push(
      {
        section: "ask",
        id: repeatedId("ask", n),
        exchange: n,
        speaker: "asker",
        said: ask,
      },
      {
        section: "opening",
        id: repeatedId("opening", n),
        exchange: n,
        speaker: "you",
        said: transcript,
      }
    )
  scenes.push({
    section: "open",
    id: "open",
    speaker: "tutor",
    said: essay.open.said,
  })
  let dives = 0
  let answers = 0
  let forks = 0
  for (const [i, ticket] of essay.tickets.entries()) {
    const n = i + 1
    const id = (section: Repeated): string => repeatedId(section, n)
    const title = `${ticket.id}: ${ticket.title}`
    if (shape.chapters.includes("question"))
      scenes.push({
        section: "chapter",
        id: repeatedId("chapter-question", n),
        of: "question",
        ticket: ticket.id,
        title,
        speaker: "tutor",
        said: `${title}.`,
      })
    const of = { ticket: ticket.id }
    scenes.push({
      section: "question",
      id: id("question"),
      ...of,
      speaker: "tutor",
      said: ticket.question.said,
    })
    if (!byPointsOnly(ticket)) {
      answers += 1
      scenes.push({
        section: "answer",
        id: repeatedId("answer", answers),
        ...of,
        ...answerSaid(ticket.answer),
      })
    }
    for (const [point, { answer }] of ticket.points.entries()) {
      if (answer === undefined) continue
      answers += 1
      scenes.push({
        section: "answer",
        id: repeatedId("answer", answers),
        ...of,
        point,
        ...answerSaid(answer),
      })
    }
    scenes.push(
      {
        section: "best",
        id: id("best"),
        ...of,
        speaker: "tutor",
        said: ticket.best.said,
      },
      {
        section: "beside",
        id: id("beside"),
        ...of,
        speaker: "tutor",
        said: ticket.beside.said,
      }
    )
    for (const [point, { fork }] of ticket.points.entries()) {
      if (fork === undefined) continue
      forks += 1
      scenes.push({
        section: "fork",
        id: repeatedId("fork", forks),
        ...of,
        point,
        speaker: "tutor",
        said: fork.said,
      })
    }
    for (const [k, dive] of ticket.dives.entries()) {
      dives += 1
      scenes.push({
        section: "dive",
        id: repeatedId("dive", dives),
        ...of,
        dive: k,
        speaker: "tutor",
        said: dive.said,
      })
    }
  }
  for (const section of ["weeks", "next"] as const) {
    if (shape.chapters.includes(section))
      scenes.push({
        section: "chapter",
        id: `chapter-${section}`,
        of: section,
        title: ESSAY_CHAPTERS[section],
        speaker: "tutor",
        said: `${ESSAY_CHAPTERS[section]}.`,
      })
    scenes.push({
      section,
      id: section,
      speaker: "tutor",
      said: essay[section].said,
    })
  }
  if (shape.brand.outro)
    scenes.push({
      section: "brand-out",
      id: "brand-out",
      speaker: "tutor",
      said: "",
    })
  return scenes
}

/** SOLO's relational level: an answer here or above shows the concept known. */
export const SOLO_KNOWN = 4

/**
 * What the chart marks in a cell. A level is shown; below relational it is
 * met, not yet known (`known` false). `decayed` names the earlier week the
 * answer came back lower than, or is null. `unmet` before the concept's first
 * level is "not met yet", and after it "not checked that week" (`since`).
 */
export type CellView =
  | {
      readonly kind: "level"
      readonly level: number
      readonly known: boolean
      readonly decayed: string | null
    }
  | { readonly kind: "unmet"; readonly since: boolean }
  | { readonly kind: "silent" }
  | { readonly kind: "faded" }

/**
 * A concept's row as the chart draws it, over `weeks`, its weeks, in an
 * essay of template `version`. From version 2 decay is the record's, named in
 * the cell; a version 1 essay has none, so a plain level below one shown in
 * an earlier column is drawn as decay.
 */
export function cellsOf(
  cells: ReadonlyArray<EssayCell>,
  weeks: ReadonlyArray<string>,
  version: number
): Array<CellView> {
  const inWindow = version < ESSAY_DECAY_VERSION
  let best: { level: number; week: string } | null = null
  let met = false
  return cells.map((cell, i): CellView => {
    if (cell === "unmet") return { kind: "unmet", since: met }
    met = true
    if (cell === "silent" || cell === "faded") return { kind: cell }
    const week = weeks[i] ?? ""
    const level = typeof cell === "number" ? cell : cell.level
    const decayed =
      typeof cell === "object"
        ? cell.below
        : inWindow && best !== null && level < best.level
          ? best.week
          : null
    if (best === null || decayed !== null || level > best.level)
      best = { level, week }
    return { kind: "level", level, known: level >= SOLO_KNOWN, decayed }
  })
}

/**
 * The essay as a cut list the renderer draws (`stillsCutList`, which holds
 * CV1): one still per scene (`<file>.png`, the stage recorded), and its take
 * (`<file>.wav`) where one was said, `takes[i]`: the speaker's for the
 * tutor, the owner's own for an answer (`owner`), played whole. Captions are
 * drawn as the essay's shape says, and the music bed plays under the voice
 * once the series names one (`bed`).
 */
export function essayCutList(
  essay: Essay,
  takes: ReadonlyArray<StillTake | null>,
  {
    bed = false,
    voicing = "owner",
    screens,
  }: {
    readonly bed?: boolean
    readonly voicing?: Voicing
    /**
     * The phone's own cards of the week (RR31), in the video's `screens/`:
     * with them, each question scene shows its ticket's card, zoomed to
     * what is said (`essayZoomRefs`).
     */
    readonly screens?: Screens
  } = {}
): CutList {
  const format = essayFormat(essay.template.version)
  const theme = markThemeOf(format.shape)
  return stillsCutList(
    {
      title: `The Rust Rounds essay, ${essay.week.id}`,
      series: format.series,
      look: "calm",
      captions: hasCaptions(format),
      bed,
      ...(format.shape ? { shape: format.shape } : {}),
    },
    essayScenes(essay, voicing).map((scene, i) => {
      const refs = essayZoomRefs(essay, scene)
      const picture =
        screens === undefined || refs.length === 0
          ? null
          : zoomPicture(screens, refs, {
              foot: ESSAY_ZOOM_FOOT,
              ...(theme === undefined ? {} : { theme }),
            })
      return {
        id: scene.id,
        file: stillFile(i, scene.id),
        said: scene.said,
        ...(picture === null ? {} : { picture }),
      }
    }),
    takes
  )
}

/**
 * The share of the essay's 1920×1080 frame its stage keeps clear at the
 * foot for captions (`@some-ui/burn-ins`' `captionSpace(LANDSCAPE)`, 372 px,
 * which this package can't import; held equal by www's essay test), so a
 * zoomed card stays above them.
 */
export const ESSAY_ZOOM_FOOT = 372 / 1080

/** The most of rustc's diagnostics a question scene zooms to, in rustc's order. */
const ZOOM_DIAGNOSTICS = 2

/**
 * The regions of the phone's card a scene zooms to, in order, by their
 * names (`./screen`'s `regionRef`; C797): a question scene goes to its
 * ticket's question, each speak-to point, the program and rustc's first
 * diagnostics, in that order, each held an even share of the scene
 * (C795), the first `ZOOM_STOPS_MOST`. Any other scene shows its still: a deep
 * dive's own code is a snippet the phone never draws (#3288), and the
 * stage's other scenes show what no card does.
 */
export function essayZoomRefs(
  essay: Essay,
  scene: EssayScene
): Array<RegionRef> {
  if (scene.section !== "question" || scene.ticket === undefined) return []
  const ticket = essay.tickets.find((each) => each.id === scene.ticket)
  if (ticket === undefined) return []
  const numbered = (
    kind: "point" | "diagnostic",
    most: number
  ): Array<RegionRef> =>
    Array.from({ length: most }, (_, j) => regionRef(ticket.id, kind, j + 1))
  return [
    regionRef(ticket.id, "question"),
    ...numbered("point", ticket.points.length),
    regionRef(ticket.id, "program"),
    ...numbered("diagnostic", ZOOM_DIAGNOSTICS),
  ].slice(0, ZOOM_STOPS_MOST)
}

/**
 * Where the essay's chapters start (SFEED4): each chapter slide, a ticket's
 * titled by its key and title, so a rewatch can go straight to a ticket.
 */
export const essayChapterMarks = (essay: Essay): Array<ChapterMark> =>
  chapterSlides(
    essayScenes(essay).filter((scene) => scene.section === "chapter")
  )

/**
 * The essay's storyboard (SFEED3): every frame of the template's sample
 * essay, as `essayScenes` lays it out, with the fill's words left for the
 * fill.
 */
export function essayStoryboard(): Storyboard {
  const essay = sampleEssay()
  if (!essay.ok) throw new Error(essay.problems.join("; "))
  return storyboardOf(
    essayFormat(essay.value.template.version),
    `the sample essay, ${essay.value.week.id}`,
    essayScenes(essay.value, "sample").map(boardSceneOf)
  )
}

/**
 * The take an essay's scene plays, by its id in the folder home hands the
 * recorder: an opening answer's (`opening.2`, `openingTakeId`), a ticket's
 * (`QM-311`) or, for a point answered by a take of its own, the point's
 * (`QM-311.2`, `pointTakeId`); null for a scene the owner doesn't say.
 */
export const essayTakeOf = (scene: EssayScene): string | null =>
  scene.section === "opening" && scene.exchange !== undefined
    ? openingTakeId(scene.exchange)
    : scene.section === "answer" &&
        scene.speaker === "you" &&
        scene.ticket !== undefined
      ? scene.point === undefined
        ? scene.ticket
        : pointTakeId(scene.ticket, scene.point + 1)
      : null

/**
 * Each answer of the essay by its take's id (`essayTakeOf`): every
 * ticket's, then every point's answered by a take of its own.
 */
const answersById = (
  essay: Essay
): Array<{
  readonly id: string
  readonly answer: EssayTicket["answer"] | EssayPointAnswer
}> =>
  essay.tickets.flatMap((ticket) => [
    { id: ticket.id, answer: ticket.answer },
    ...ticket.points.flatMap((point, j) =>
      point.answer === undefined
        ? []
        : [{ id: pointTakeId(ticket.id, j + 1), answer: point.answer }]
    ),
  ])

/**
 * Which of `names`, the files in the folder home hands the recorder, is each
 * answered take (RR16): exactly one audio file `<TICKET>.<ext>` for each
 * ticket the owner answered whole, and `<TICKET>.<n>.<ext>` for each point
 * n (from 1) answered by a take of its own (RR24), each with its word times
 * `<id>.words.json` where home kept them (`takeFilesOf`, which says what it
 * refuses).
 */
export function essayTakeFiles(
  essay: Essay,
  names: ReadonlyArray<string>
): Parsed<Readonly<Record<string, TakeFiles>>> {
  const answers = answersById(essay)
  const ids = (
    keep: (answer: (typeof answers)[number]["answer"]) => boolean
  ): Array<string> =>
    answers.filter(({ answer }) => keep(answer)).map(({ id }) => id)
  // An opening answer's take plays when the essay holds it; one home hands
  // over that the essay leaves out (heard as nothing, or unheard) is set
  // aside.
  const plays = new Set(essay.opening?.exchanges.map((e) => e.n) ?? [])
  const opening = Array.from({ length: CONVERSATION_MOST }, (_, i) => i + 1)
  return takeFilesOf(
    {
      answered: [
        ...opening.filter((n) => plays.has(n)).map(openingTakeId),
        ...ids((answer) => answer.kind === "take"),
      ],
      silent: ids((answer) => answer.kind === "silence"),
      unheard: [
        ...opening.filter((n) => !plays.has(n)).map(openingTakeId),
        ...ids(isUnheard),
      ],
      noun: "ticket or point",
    },
    names
  )
}
