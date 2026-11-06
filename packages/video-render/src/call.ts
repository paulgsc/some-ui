/**
 * The weekly call (STUDIO ST29's first template, the owner's call of
 * 2026-11-06): once a week, the agents that worked both repositories report
 * to the owner the way a stand-up does, so the owner learns where things
 * stand by watching one video instead of reading archived sessions. It is
 * public, as everything the owner makes is.
 *
 * Every call has the same sections in the same order (`callFormat`); only the
 * week's data (`CallWeekSchema`) changes. The sections, in order:
 *
 * 1. `open`: the week and the commits it read.
 * 2. `board`: everything open in the Residual Ledger, at a glance.
 * 3. `moved`: where each epic that moved this week stands.
 * 4. `done`: what merged, in batches of related pull requests the agent
 *    chose.
 * 5. `gray`: technical calls in a gray area: a promise or invariant
 *    declared, amended or retired, not the details of the code.
 * 6. `mine`: calls an agent made without the owner's word, worth hearing:
 *    the options it had, the one it took, why, and how to undo it.
 * 7. `asks`: what waits on the owner: why it is theirs, the options and
 *    what each unblocks. Each ask is one scene with a stable id, so the
 *    owner can pause on it and answer it (a later slice); the asks not
 *    voiced this week are listed on screen (`later`).
 * 8. `close`.
 *
 * The week's data is the call's DNA with the template: the words said
 * (`said`, an agent's, never the owner's) and everything shown come from it,
 * so the video can always be made again from it, and sharing it is sharing
 * the video. The ids are stable: a reply to an ask names the ask's id.
 */

import { z } from "zod"

import { once, problemsOf } from "./cut-list"
import type { Parsed } from "./cut-list"
import { FORMAT_SCHEMA, repeatedId, showId, words } from "./format"
import type { Format } from "./format"

export const CALL_WEEK_SCHEMA = "some-ui.call-week/1"

/** The call's template: its format's id, and its series'. */
export const CALL_ID = "conference-call"

/** The version `callFormat` gives, pinned as `v<n>.json` under `templates/`. */
export const CALL_VERSION = 1

/** The most items a repeated section shows in one call. */
export const CALL_MOST = {
  moved: 12,
  done: 12,
  gray: 8,
  mine: 8,
  asks: 12,
} as const

/** The most rows the board lists, and the most asks listed but not voiced. */
export const CALL_BOARD_MOST = 60
export const CALL_LATER_MOST = 200

/** The size the stage draws the call at, in CSS px: a 16:9 frame. */
const STAGE_WIDTH = 1920

type Repeated = keyof typeof CALL_MOST
type Section = Repeated | "open" | "board" | "close"

const isRepeated = (section: Section): section is Repeated =>
  section !== "open" && section !== "board" && section !== "close"

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
    from: `the call's ${id} view`,
    cssWidth: STAGE_WIDTH,
  },
  holdMs,
  ...(isRepeated(id) ? { repeat: { max: CALL_MOST[id] } } : {}),
})

/** The call's format: its sections, in the order every call says them. */
export function callFormat(): Format {
  return {
    schema: FORMAT_SCHEMA,
    id: CALL_ID,
    version: CALL_VERSION,
    title: "The weekly call",
    series: { id: CALL_ID, version: 1 },
    look: "calm",
    scenes: [
      scene("open", "The week", "Which week this is, and what it read", 8_000),
      scene(
        "board",
        "The board",
        "Everything still open, and how much of it waits on you",
        30_000
      ),
      scene(
        "moved",
        "Where we are",
        "Where this epic stands now, and what is next",
        25_000
      ),
      scene(
        "done",
        "What landed",
        "What these pull requests changed, together",
        30_000
      ),
      scene(
        "gray",
        "A call in a gray area",
        "A technical call no check could make, and what it holds",
        30_000
      ),
      scene(
        "mine",
        "A call made without you",
        "What an agent chose without your word, why, and how to undo it",
        40_000
      ),
      scene(
        "asks",
        "Waiting on you",
        "What is yours to decide, why, the options and what each unblocks",
        45_000
      ),
      scene("close", "Close", "What the week comes to", 10_000),
    ],
  }
}

/** A pull request or an issue in one of the two repositories. */
const RefSchema = z.strictObject({
  repo: z.enum(["some-ui", "server"]),
  kind: z.enum(["pr", "issue"]),
  number: z.number().int().positive(),
})

export type CallRef = z.infer<typeof RefSchema>

/** Where `ref` is on GitHub. */
export const refUrl = (ref: CallRef): string =>
  `https://github.com/paulgsc/${ref.repo}/${ref.kind === "pr" ? "pull" : "issues"}/${ref.number}`

/** An item's id: what a reply names, so stable across the week's data. */
const itemId = showId

/** A day, as `YYYY-MM-DD`. */
const day = z.iso.date()

/** A commit, by its full sum. */
const commit = z.string().regex(/^[0-9a-f]{40}$/)

/** What a scene says: an agent's words, read aloud. */
const said = words

const refs = z.array(RefSchema).min(1)

const BoardRowSchema = z.strictObject({
  /** The Residual Ledger item's id. */
  ledger: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  title: words,
  status: z.enum(["decide", "open", "doing", "done"]),
  /** How many of its stories wait on the owner. */
  waitsOnYou: z.number().int().nonnegative(),
})

const MovedSchema = z.strictObject({
  id: itemId,
  /** The epic's tag, as its title carries it: "STUDIO". */
  tag: z.string().regex(/^[A-Z][A-Z0-9-]{0,23}$/),
  epic: RefSchema,
  said,
  landed: z.array(RefSchema),
  next: z.array(words),
})

const PullSchema = RefSchema.extend({
  kind: z.literal("pr"),
  title: words,
  /** Its commits' `Change-Kind:`. */
  change: z.enum(["story", "defect"]),
})

const BatchSchema = z.strictObject({
  id: itemId,
  /** What ties the batch together, as the agent grouped it. */
  title: words,
  said,
  pulls: z.array(PullSchema).min(1),
})

const GraySchema = z.strictObject({
  id: itemId,
  title: words,
  said,
  /** The promise or invariant it declares, amends or retires: "SS2". */
  promise: z
    .string()
    .regex(/^[A-Z][A-Z0-9]*[0-9]+[a-z]?$/)
    .optional(),
  refs,
})

const MineSchema = z.strictObject({
  id: itemId,
  title: words,
  said,
  options: z.array(words).min(2).max(4),
  /** The option it took, by its place in `options`. */
  chose: z.number().int().nonnegative(),
  why: words,
  /** How the owner undoes it, if they would rather not. */
  undo: words,
  refs,
})

const OptionSchema = z.strictObject({
  says: words,
  /** What choosing it lets go ahead. */
  unblocks: words,
})

const AskSchema = z.strictObject({
  id: itemId,
  question: words,
  said,
  /** Why it is the owner's, not an agent's. */
  whyYours: words,
  options: z.array(OptionSchema).min(2).max(4),
  /** The option the agent recommends, by its place in `options`. */
  recommended: z.number().int().nonnegative().optional(),
  refs,
})

const LaterSchema = z.strictObject({
  id: itemId,
  question: words,
  refs,
})

const SaidSchema = z.strictObject({ said })

export const CallWeekSchema = z.strictObject({
  schema: z.literal(CALL_WEEK_SCHEMA),
  template: z.strictObject({
    id: z.literal(CALL_ID),
    version: z.number().int().positive(),
  }),
  /** The days it covers, both included. */
  week: z.strictObject({ from: day, to: day }),
  /** The commits on each repository's main it read: how fresh it is. */
  read: z.strictObject({ "some-ui": commit, server: commit }),
  open: SaidSchema,
  board: z.strictObject({
    said,
    rows: z.array(BoardRowSchema).min(1).max(CALL_BOARD_MOST),
  }),
  moved: z.array(MovedSchema).max(CALL_MOST.moved),
  done: z.array(BatchSchema).max(CALL_MOST.done),
  gray: z.array(GraySchema).max(CALL_MOST.gray),
  mine: z.array(MineSchema).max(CALL_MOST.mine),
  asks: z.array(AskSchema).max(CALL_MOST.asks),
  /** The asks waiting on the owner that aren't voiced this week. */
  later: z.array(LaterSchema).max(CALL_LATER_MOST),
  close: SaidSchema,
})

export type CallWeek = z.infer<typeof CallWeekSchema>

/** Every reason the week's parsed data contradicts itself. */
function weekProblems(week: CallWeek): Array<string> {
  const problems: Array<string> = []
  if (week.week.from > week.week.to)
    problems.push("week: it ends before it starts")
  const ids = [
    ...week.moved,
    ...week.done,
    ...week.gray,
    ...week.mine,
    ...week.asks,
    ...week.later,
  ].map((item) => item.id)
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) problems.push(`${id}: two items share this id`)
    seen.add(id)
  }
  const ledger = week.board.rows.map((row) => row.ledger)
  if (new Set(ledger).size !== ledger.length)
    problems.push("board: a ledger item is listed twice")
  week.mine.forEach((call) => {
    if (call.chose >= call.options.length)
      problems.push(`${call.id}: it chose an option it doesn't list`)
  })
  week.asks.forEach((ask) => {
    if (ask.recommended !== undefined && ask.recommended >= ask.options.length)
      problems.push(`${ask.id}: it recommends an option it doesn't list`)
  })
  return once(problems)
}

/** The week's data, or every reason it can't make a call. */
export function parseCallWeek(raw: unknown): Parsed<CallWeek> {
  const parsed = CallWeekSchema.safeParse(raw)
  if (!parsed.success)
    return { ok: false, problems: problemsOf(parsed.error, "call week") }
  const problems = weekProblems(parsed.data)
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, value: parsed.data }
}

/** One scene of a call: its section, its id in the video, and what it says. */
export type CallScene = {
  readonly section: Section
  /** The scene's id: its section's, or `<section>-<n>` for an item. */
  readonly id: string
  /** The item it shows, by the week's id; absent for a section's own scene. */
  readonly item?: string
  readonly said: string
}

/**
 * The call's scenes in the order said: one per section that shows once, and
 * one per item of a repeated section, none where it has no items.
 */
export function callScenes(week: CallWeek): ReadonlyArray<CallScene> {
  const items = (
    section: Repeated,
    list: ReadonlyArray<{ readonly id: string; readonly said: string }>
  ): Array<CallScene> =>
    list.map((item, i) => ({
      section,
      id: repeatedId(section, i + 1),
      item: item.id,
      said: item.said,
    }))
  return [
    { section: "open", id: "open", said: week.open.said },
    { section: "board", id: "board", said: week.board.said },
    ...items("moved", week.moved),
    ...items("done", week.done),
    ...items("gray", week.gray),
    ...items("mine", week.mine),
    ...items("asks", week.asks),
    { section: "close", id: "close", said: week.close.said },
  ]
}
