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
 *      at why;
 *    - `best`: a best fit, an independent answer to each speak-to point,
 *      never called "correct";
 *    - `beside`: the best fit beside the owner's answer, each point covered,
 *      partly or missing, with the SOLO level and the whole scale;
 *    - `dive`, twice (K = `ESSAY_DIVES`): the biggest gaps, 2 to 5 minutes
 *      each; a point with no gap goes one step past the ticket.
 * 3. `weeks`: over the weeks, each concept's SOLO level per week, and the
 *    role line (#2694), both RR19's derivation.
 * 4. `next`: next week.
 *
 * The look is template A, the call (owner, 2026-11-07): two bubbles, the
 * tutor and the owner, the one speaking lit (`speaker`), the content beside
 * them, the caption underneath. The tutor's words are Kokoro's; the owner's
 * are their own take, so an answer scene's `said` is its transcript.
 *
 * The essay reaches the stage from home's store (ask #2684), through the
 * mailbox's `rust-essay` folder (RR18); until then the stage plays the
 * sample (`sampleEssay`).
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
import { once, problemsOf } from "./cut-list"
import type { Parsed } from "./cut-list"
import { FORMAT_SCHEMA, repeatedId, versionRefusal, words } from "./format"
import type { Format, Shape } from "./format"
import sample from "./templates/rust-essay/sample-essay.json"

export const ESSAY_SCHEMA = "some-ui.rust-essay/1"

/** The essay's template: its format's id. */
export const ESSAY_ID = "rust-essay"

/** The newest version `essayFormat` gives, pinned as `v<n>.json` under `templates/`. */
export const ESSAY_VERSION = 1

/** The deep dives per ticket, on its biggest gaps: K (owner, 2026-11-07). */
export const ESSAY_DIVES = 2

/** The most tickets a week has (`some-ui.rust-week/1`). */
const TICKETS_MOST = 4

/** The most weeks the chart shows, newest last. */
export const ESSAY_WEEKS_MOST = 12

/** The most concepts the chart shows. */
export const ESSAY_CONCEPTS_MOST = 12

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

/** How a speak-to point of the owner's answer stands beside the best fit. */
export const MARKS = ["covered", "partly", "missing"] as const
export type Mark = (typeof MARKS)[number]

type Section =
  | "open"
  | "question"
  | "answer"
  | "best"
  | "beside"
  | "dive"
  | "weeks"
  | "next"

type Repeated = Exclude<Section, "open" | "weeks" | "next">

/** The scenes a shape adds: the locked intro, the brand intro and outro, and a chapter slide. */
type Framing = "intro" | "brand-in" | "chapter" | "brand-out"

/** How many of each repeated scene an essay can have. */
const ESSAY_MOST: Readonly<Record<Repeated, number>> = {
  question: TICKETS_MOST,
  answer: TICKETS_MOST,
  best: TICKETS_MOST,
  beside: TICKETS_MOST,
  dive: TICKETS_MOST * ESSAY_DIVES,
}

const isRepeated = (section: Section): section is Repeated =>
  section in ESSAY_MOST

const scene = (
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
  ...(isRepeated(id) ? { repeat: { max: ESSAY_MOST[id] } } : {}),
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
 * said, each repeated scene once per ticket (`dive` twice). Throws for a
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
      scene(
        "open",
        "The week",
        "The company, its story and the SLA the tickets answer to",
        40_000
      ),
      scene(
        "question",
        "The question",
        "What the ticket asked, and what to speak to",
        40_000
      ),
      scene(
        "answer",
        "Your answer",
        "Your take, played whole; or the silence, and a guess at why",
        45_000
      ),
      scene(
        "best",
        "A best fit",
        "An answer to each speak-to point, made apart from yours",
        60_000
      ),
      scene(
        "beside",
        "The best fit beside yours",
        "Each point covered, partly or missing, and where that sits on SOLO",
        50_000
      ),
      scene(
        "dive",
        "A deep dive",
        "One of the biggest gaps, from the ground up, or one step past the ticket",
        180_000
      ),
      scene(
        "weeks",
        "Over the weeks",
        "Each concept across the weeks, never known apart from decayed, and the role it fits",
        70_000
      ),
      scene("next", "Next week", "What next week comes back to", 20_000),
    ],
    shape: ESSAY_SHAPE,
  }
}

/** A week's id, as `some-ui.rust-week/1` writes it (`@some-ui/rust-rounds`' `WEEK_ID`). */
const weekId = z
  .string()
  .regex(/^\d{4}-w(?:0[1-9]|[1-4]\d|5[0-3])$/, "a week's id is like 2026-w46")

/** A ticket's key, as `some-ui.rust-week/1` writes it (`TICKET_KEY`). */
const ticketKey = z
  .string()
  .regex(/^[A-Z][A-Z0-9]{0,5}-\d{1,6}$/, "a ticket's id is a key like QM-311")

/** A program or snippet, shown as written: never only spaces. */
const code = z.string().refine((s) => s.trim().length > 0, "it is empty")

const SoloSchema = z.strictObject({
  /** Its place on `SOLO_LEVELS`, from 1. */
  level: z.number().int().min(1).max(SOLO_LEVELS.length),
  /** Why the answer reads at that level, in a sentence. */
  why: words,
})

const AnswerSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("take"),
    /** What the owner said, as home heard it: the answer scene's caption. */
    transcript: words,
    /** Each speak-to point, in order, as it stands beside the best fit. */
    marks: z.array(
      z.strictObject({ mark: z.enum(MARKS), note: words.optional() })
    ),
    solo: SoloSchema,
  }),
  z.strictObject({
    kind: z.literal("silence"),
    /** How many times the ticket was opened and nothing sent. */
    opened: z.number().int().nonnegative(),
    /** The guess at why, said over the silence. */
    guess: words,
  }),
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

const TicketSchema = z.strictObject({
  id: ticketKey,
  title: words,
  spec: words,
  /** The figures the scenario stated as given; never measured. */
  figures: z.array(words),
  program: code,
  /** The speak-to points in order, each with the best fit's answer to it. */
  points: z
    .array(z.strictObject({ to: words, best: words }))
    .min(2)
    .max(3),
  answer: AnswerSchema,
  question: SaidSchema,
  best: SaidSchema,
  beside: SaidSchema,
  dives: z.array(DiveSchema).length(ESSAY_DIVES),
})

/** A concept's cell for one week: its SOLO level, not met, or not answered. */
const CellSchema = z.union([
  z.number().int().min(1).max(SOLO_LEVELS.length),
  z.literal("unmet"),
  z.literal("silent"),
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

/** How big a point's gap is: missing, partly, covered; every point of a silence is missing. */
const gapOf = (ticket: EssayTicket, point: number): number => {
  if (ticket.answer.kind === "silence") return 2
  const mark = ticket.answer.marks[point]?.mark
  return mark === "missing" ? 2 : mark === "partly" ? 1 : 0
}

/** Whether dive `dive` of `ticket` goes past it: into a point the answer covered. */
export const isPast = (ticket: EssayTicket, dive: EssayDive): boolean =>
  gapOf(ticket, dive.point) === 0

function ticketProblems(ticket: EssayTicket): Array<string> {
  const problems: Array<string> = []
  const points = ticket.points.length
  if (ticket.answer.kind === "take" && ticket.answer.marks.length !== points)
    problems.push(
      `${ticket.id}: its answer marks ${ticket.answer.marks.length} points, and it has ${points}`
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

/** Every reason the essay's parsed data contradicts itself. */
function essayProblems(essay: Essay): Array<string> {
  const problems: Array<string> = []
  if (essay.week.to < essay.week.from)
    problems.push("week: it ends before it starts")
  const ids = essay.tickets.map((ticket) => ticket.id)
  if (new Set(ids).size !== ids.length)
    problems.push("tickets: two share an id")
  for (const ticket of essay.tickets) problems.push(...ticketProblems(ticket))
  const { weeks, concepts } = essay.weeks
  if (weeks.at(-1) !== essay.week.id)
    problems.push(`weeks: the chart doesn't end on ${essay.week.id}`)
  if (weeks.some((week, i) => i > 0 && week <= (weeks[i - 1] ?? "")))
    problems.push("weeks: they aren't oldest first, each once")
  for (const concept of concepts)
    if (concept.cells.length !== weeks.length)
      problems.push(
        `${concept.name}: it has ${concept.cells.length} cells for ${weeks.length} weeks`
      )
  if (essay.next.week <= essay.week.id)
    problems.push(
      `next: ${essay.next.week} doesn't come after ${essay.week.id}`
    )
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

/** Who is speaking, and so whose bubble is lit. */
export type Speaker = "tutor" | "you"

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

/** How many of the essay's tickets the owner answered. */
export const answeredOf = (essay: Essay): number =>
  essay.tickets.filter((ticket) => ticket.answer.kind === "take").length

/**
 * The locked intro (SFEED2), as the call's is: who wrote the essay, what
 * drew it, whose voices are in it and what judges it, each a row on the
 * frame and all of it said. Filled by code from the essay alone, never by
 * the routine that writes it.
 */
export function essayIntro(essay: Essay): LockedIntro {
  const answered = answeredOf(essay)
  const of = `${answered} of ${essay.tickets.length} tickets`
  return {
    rows: [
      {
        label: "Written by",
        says: "Claude, from the week's exercise and the owner's takes",
      },
      {
        label: "Drawn by",
        says: `Code: the Rust Rounds essay's template, version ${essay.template.version}, in paulgsc/some-ui`,
      },
      {
        label: "Voices",
        says: "The tutor is Kokoro, a synthetic speaker. The other voice is the owner's own, from their takes",
      },
      { label: "Judged by", says: SOLO_SOURCE },
      { label: "Checked against", says: essay.references.join(" · ") },
      { label: "Answered", says: of },
    ],
    said: [
      `This is the Rust Rounds essay for ${essay.week.id}, ${sayDay(essay.week.from)} to ${sayDay(essay.week.to)}.`,
      "Claude wrote the tutor's words, and code drew every frame.",
      "The tutor's voice is synthetic; the other voice is the owner's own.",
      `The owner answered ${of}.`,
    ].join(" "),
  }
}

/**
 * The essay's scenes in the order said. In each ticket: its chapter slide,
 * the question, the answer, a best fit, the two beside each other, then its
 * deep dives. The locked intro and the brand intro open it, a chapter slide
 * opens each ticket and the close's sections, and the brand outro ends it.
 */
export function essayScenes(essay: Essay): ReadonlyArray<EssayScene> {
  const shape = essayFormat(essay.template.version).shape ?? ESSAY_SHAPE
  const scenes: Array<EssayScene> = [
    {
      section: "intro",
      id: "intro",
      speaker: "tutor",
      said: essayIntro(essay).said,
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
  let dives = 0
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
    scenes.push(
      {
        section: "question",
        id: id("question"),
        ...of,
        speaker: "tutor",
        said: ticket.question.said,
      },
      ticket.answer.kind === "take"
        ? {
            section: "answer",
            id: id("answer"),
            ...of,
            speaker: "you",
            said: ticket.answer.transcript,
          }
        : {
            section: "answer",
            id: id("answer"),
            ...of,
            speaker: "tutor",
            said: ticket.answer.guess,
          },
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

/** What the chart marks in a cell beside its level: an answer lower than an earlier one is decay. */
export type CellView =
  | {
      readonly kind: "level"
      readonly level: number
      readonly decayed: boolean
    }
  | { readonly kind: "unmet" }
  | { readonly kind: "silent" }

/**
 * A concept's row as the chart draws it. Decay is observed: a level below
 * one shown in an earlier week. What may have faded unseen is RR19's
 * recheck rule, not drawn here.
 */
export function cellsOf(cells: ReadonlyArray<EssayCell>): Array<CellView> {
  let best = 0
  return cells.map((cell) => {
    if (cell === "unmet" || cell === "silent") return { kind: cell }
    const decayed = cell < best
    best = Math.max(best, cell)
    return { kind: "level", level: cell, decayed }
  })
}
