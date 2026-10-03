/**
 * aph as a reconciliation, the way a ledger is reconciled against a bank
 * statement. Pure: no clock, no storage, no React. Every screen reads its
 * numbers and its verdicts from here, so "reconciled" and "the delta" mean
 * one thing everywhere.
 *
 * For a day and a time of day there are three figures:
 *
 * - **mine**: what I observed, usually rough ("~4,300"), written down when I
 *   took it;
 * - **theirs**: what the other side reports, later, and outside my control;
 * - **goal**: what it is supposed to be at that time.
 *
 * Mine against theirs is the reconciliation: within `tolerance` it settles
 * by itself, otherwise it waits for my call, to agree with their figure or
 * flag it. The standing figure (theirs once reported, else mine) against the
 * goal is the delta.
 *
 * The first entries are the paper notes this replaces (`seed.ts`), which
 * carry only mine and the goals.
 */

/** A fixed time of day an entry is taken at, and what aph should be then. */
export type Checkpoint = {
  id: string
  /** As shown: "7:00". */
  label: string
  /** Minutes after local midnight. */
  minutes: number
  goal: number
}

export type AphSettings = {
  checkpoints: ReadonlyArray<Checkpoint>
  /** The defined labels an entry can carry, in the order they are offered. */
  labels: ReadonlyArray<string>
  /** What the - and + buttons move a figure by. */
  step: number
  /** Outside this range a figure is probably a typo, and the logger says so. */
  usualLow: number
  usualHigh: number
  /** Mine and theirs this close (either way) reconcile without asking. */
  tolerance: number
  /** The first day tracked (local `YYYY-MM-DD`): History stops there. */
  since: string
}

/** My call on an entry whose figures do not reconcile by themselves. */
export type Review = "agreed" | "flagged"

export type Entry = {
  id: string
  /** Local calendar day, `YYYY-MM-DD`. */
  day: string
  /** The checkpoint it belongs to, or null for any other time of day. */
  checkpoint: string | null
  /**
   * The clock time as written, for an entry off the checkpoints ("4:00").
   * Null at a checkpoint, and null for one whose time was never written
   * down, which History flags rather than guesses.
   */
  time: string | null
  mine: { value: number; approx: boolean } | null
  theirs: { value: number } | null
  /**
   * The goal when the entry was made. Changing a checkpoint's goal later
   * leaves past deltas as they were.
   */
  goal: number | null
  labels: ReadonlyArray<string>
  /** Anything a label does not say. Short; the labels carry the common cases. */
  note: string | null
  review: Review | null
}

/**
 * Where an entry's reconciliation stands, worst first in `RECONCILE_ORDER`:
 *
 * - `flagged`: I dispute their figure;
 * - `review`: the figures differ by more than `tolerance` (or I never wrote
 *   mine down) and I have not decided;
 * - `awaiting`: their figure has not come in yet;
 * - `agreed`: they differ, and I accepted theirs;
 * - `matched`: within `tolerance`, settled without me.
 */
export type ReconcileStatus =
  | "flagged"
  | "review"
  | "awaiting"
  | "agreed"
  | "matched"

export const RECONCILE_ORDER: ReadonlyArray<ReconcileStatus> = [
  "flagged",
  "review",
  "awaiting",
  "agreed",
  "matched",
]

export type Reconciliation = {
  status: ReconcileStatus
  /** Theirs minus mine, when both exist. */
  gap: number | null
}

export function reconcile(settings: AphSettings, entry: Entry): Reconciliation {
  const { mine, theirs } = entry
  if (theirs === null) return { status: "awaiting", gap: null }
  const gap = mine === null ? null : theirs.value - mine.value
  if (gap !== null && Math.abs(gap) <= settings.tolerance) {
    return { status: "matched", gap }
  }
  if (entry.review === "flagged") return { status: "flagged", gap }
  if (entry.review === "agreed") return { status: "agreed", gap }
  return { status: "review", gap }
}

/** The figure that stands for the entry: theirs once reported, else mine. */
export function standing(entry: Entry): number | null {
  return entry.theirs?.value ?? entry.mine?.value ?? null
}

/** Standing figure minus goal, or null when either is missing. */
export function goalDelta(entry: Entry): number | null {
  const value = standing(entry)
  return value === null || entry.goal === null ? null : value - entry.goal
}

export function isUsual(settings: AphSettings, value: number): boolean {
  return value >= settings.usualLow && value <= settings.usualHigh
}

/** How far a checkpoint's window reaches either side of its time. */
const WINDOW_MINUTES = 90

export function checkpointById(
  settings: AphSettings,
  id: string | null
): Checkpoint | null {
  return settings.checkpoints.find((c) => c.id === id) ?? null
}

function hasMine(
  entries: ReadonlyArray<Entry>,
  day: string,
  checkpoint: string
): boolean {
  return entries.some(
    (e) => e.day === day && e.checkpoint === checkpoint && e.mine !== null
  )
}

/**
 * The checkpoint waiting for my figure now: the latest one whose window has
 * opened and that I have not logged today. Null when none is.
 */
export function dueCheckpoint(
  settings: AphSettings,
  entries: ReadonlyArray<Entry>,
  day: string,
  minutes: number
): Checkpoint | null {
  const open = settings.checkpoints
    .filter((c) => c.minutes - WINDOW_MINUTES <= minutes)
    .filter((c) => !hasMine(entries, day, c.id))
  return open.at(-1) ?? null
}

/**
 * Whether a checkpoint's window has closed. Home still offers it, since a
 * late figure beats none, but says it was missed rather than calling it due.
 */
export function isMissed(checkpoint: Checkpoint, minutes: number): boolean {
  return minutes > checkpoint.minutes + WINDOW_MINUTES
}

/** The next checkpoint still to come today, or null when the day is done. */
export function nextCheckpoint(
  settings: AphSettings,
  minutes: number
): Checkpoint | null {
  return (
    settings.checkpoints.find((c) => c.minutes - WINDOW_MINUTES > minutes) ??
    null
  )
}

/**
 * Entries that still want their figure, newest first: the latest day, and
 * within it the latest checkpoint, so a report arriving at noon lands on
 * noon unless I pick another.
 */
export function awaitingTheirs(
  settings: AphSettings,
  entries: ReadonlyArray<Entry>
): Array<Entry> {
  return entries
    .filter((e) => reconcile(settings, e).status === "awaiting")
    .sort(byLatest(settings))
}

/** Entries waiting on my call (`review`) or disputed (`flagged`). */
export function needsAttention(
  settings: AphSettings,
  entries: ReadonlyArray<Entry>
): { review: number; flagged: number } {
  let review = 0
  let flagged = 0
  for (const e of entries) {
    const { status } = reconcile(settings, e)
    if (status === "review") review += 1
    if (status === "flagged") flagged += 1
  }
  return { review, flagged }
}

/** Within a day: checkpoints in order, others after (stable among those). */
function inDayOrder(settings: AphSettings): (a: Entry, b: Entry) => number {
  const rank = (e: Entry): number => {
    const i = settings.checkpoints.findIndex((c) => c.id === e.checkpoint)
    return i === -1 ? settings.checkpoints.length : i
  }
  return (a, b) => rank(a) - rank(b)
}

/**
 * Newest day first; within a day, the latest checkpoint first, others after.
 * The order a list of "what came in most recently" wants, where History's
 * `entriesOn` reads a day top to bottom.
 */
function byLatest(settings: AphSettings): (a: Entry, b: Entry) => number {
  const last = settings.checkpoints.length
  const rank = (e: Entry): number => {
    const i = settings.checkpoints.findIndex((c) => c.id === e.checkpoint)
    return i === -1 ? last : last - 1 - i
  }
  return (a, b) =>
    a.day === b.day ? rank(a) - rank(b) : b.day.localeCompare(a.day)
}

/** Local `YYYY-MM-DD` for `date`. */
export function dayOf(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function minutesOf(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

function dateOf(day: string): Date {
  const [y = 1970, m = 1, d = 1] = day.split("-").map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(day: string, n: number): string {
  const date = dateOf(day)
  date.setDate(date.getDate() + n)
  return dayOf(date)
}

/** "Oct 2" */
export function formatDay(day: string): string {
  return dateOf(day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

/** "Fri" */
export function formatWeekday(day: string): string {
  return dateOf(day).toLocaleDateString("en-US", { weekday: "short" })
}

/** One row of History: a day with entries, or a run of days without. */
/**
 * One day's entries in reading order: checkpoints in their order, others
 * after. Every list that shows a day reads it from here, whatever order the
 * entries were logged in.
 */
export function entriesOn(
  settings: AphSettings,
  entries: ReadonlyArray<Entry>,
  day: string
): Array<Entry> {
  return entries.filter((e) => e.day === day).sort(inDayOrder(settings))
}

/**
 * The labels an entry's chips show: the ones offered, then any of its own
 * that Settings has since retired. Removing a label stops offering it; it
 * never rewrites the entries tagged with it, which can still drop it.
 */
export function labelsFor(settings: AphSettings, entry: Entry): Array<string> {
  return [
    ...settings.labels,
    ...entry.labels.filter((l) => !settings.labels.includes(l)),
  ]
}

/** Every label in use: the ones offered, then retired ones entries still carry. */
function labelsInUse(
  settings: AphSettings,
  entries: ReadonlyArray<Entry>
): Array<string> {
  const retired = new Set(
    entries.flatMap((e) => e.labels).filter((l) => !settings.labels.includes(l))
  )
  return [...settings.labels, ...retired]
}

export type HistoryRow =
  | { kind: "day"; day: string; entries: ReadonlyArray<Entry> }
  | { kind: "gap"; from: string; to: string; days: number }

/**
 * Every day from `settings.since` to `today`, newest first. Consecutive days
 * with nothing logged fold into one gap row, so a missed weekend is one line.
 * Today always shows as a day, logged or not.
 */
export function history(
  settings: AphSettings,
  entries: ReadonlyArray<Entry>,
  today: string
): Array<HistoryRow> {
  const byDay = new Map<string, Array<Entry>>()
  for (const e of entries) {
    byDay.set(e.day, [...(byDay.get(e.day) ?? []), e])
  }
  const rows: Array<HistoryRow> = []
  for (let day = today; day >= settings.since; day = addDays(day, -1)) {
    const logged = byDay.get(day)
    if (logged !== undefined || day === today) {
      rows.push({
        kind: "day",
        day,
        entries: entriesOn(settings, logged ?? [], day),
      })
      continue
    }
    const last = rows.at(-1)
    if (last?.kind === "gap") {
      rows[rows.length - 1] = { ...last, from: day, days: last.days + 1 }
    } else {
      rows.push({ kind: "gap", from: day, to: day, days: 1 })
    }
  }
  return rows
}

function mean(xs: ReadonlyArray<number>): number | null {
  return xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length
}

function median(xs: ReadonlyArray<number>): number | null {
  if (xs.length === 0) return null
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const at = (i: number): number => sorted[i] ?? 0
  return sorted.length % 2 === 1 ? at(mid) : (at(mid - 1) + at(mid)) / 2
}

/**
 * The entry that stands for a checkpoint on a day: the first one there with
 * no label, else the first one at all. A second entry under a label is a
 * comparison, not the day's figure.
 */
export function primary(
  entries: ReadonlyArray<Entry>,
  day: string,
  checkpoint: string
): Entry | undefined {
  const there = entries.filter(
    (e) => e.day === day && e.checkpoint === checkpoint
  )
  return there.find((e) => e.labels.length === 0) ?? there[0]
}

type CheckpointStats = {
  checkpoint: Checkpoint
  count: number
  /** Of the standing figures. */
  average: number | null
  /** Mean goal delta, each against the goal when it was made. */
  averageDelta: number | null
}

type LabelStats = {
  label: string
  /** Entries carrying it. */
  tagged: number
  /**
   * Mine with the label minus mine without, averaged over the days that have
   * both at the same checkpoint. Null with no such pair: one entry alone
   * compares nothing.
   */
  difference: number | null
  pairs: number
}

export type AphStats = {
  checkpoints: Array<CheckpointStats>
  loggedDays: number
  spanDays: number
  /** Median change from the first checkpoint to the second, on days with both. */
  firstToSecond: { median: number | null; days: number } | null
  reconciliation: Record<ReconcileStatus, number>
  labels: Array<LabelStats>
}

export function stats(
  settings: AphSettings,
  entries: ReadonlyArray<Entry>,
  today: string
): AphStats {
  const days = [...new Set(entries.map((e) => e.day))]
  let spanDays = 0
  for (let day = settings.since; day <= today; day = addDays(day, 1)) {
    spanDays += 1
  }

  const checkpoints = settings.checkpoints.map((checkpoint) => {
    const here = days
      .map((day) => primary(entries, day, checkpoint.id))
      .filter((e): e is Entry => e !== undefined)
    return {
      checkpoint,
      count: here.length,
      average: mean(here.map(standing).filter((v): v is number => v !== null)),
      averageDelta: mean(
        here.map(goalDelta).filter((d): d is number => d !== null)
      ),
    }
  })

  const [first, second] = settings.checkpoints
  let firstToSecond: AphStats["firstToSecond"] = null
  if (first !== undefined && second !== undefined) {
    const changes = days.flatMap((day) => {
      const a = standing(primary(entries, day, first.id) ?? NO_ENTRY)
      const b = standing(primary(entries, day, second.id) ?? NO_ENTRY)
      return a !== null && b !== null ? [b - a] : []
    })
    firstToSecond = { median: median(changes), days: changes.length }
  }

  const reconciliation: Record<ReconcileStatus, number> = {
    flagged: 0,
    review: 0,
    awaiting: 0,
    agreed: 0,
    matched: 0,
  }
  for (const e of entries) reconciliation[reconcile(settings, e).status] += 1

  const labels = labelsInUse(settings, entries).map((label) => {
    const tagged = entries.filter((e) => e.labels.includes(label))
    const differences = tagged.flatMap((t) => {
      const plain = entries.find(
        (e) =>
          e.day === t.day &&
          e.checkpoint === t.checkpoint &&
          e.checkpoint !== null &&
          e.labels.length === 0
      )
      return t.mine === null || plain?.mine == null
        ? []
        : [t.mine.value - plain.mine.value]
    })
    return {
      label,
      tagged: tagged.length,
      difference: mean(differences),
      pairs: differences.length,
    }
  })

  return {
    checkpoints,
    loggedDays: days.filter((d) => d >= settings.since && d <= today).length,
    spanDays,
    firstToSecond,
    reconciliation,
    labels,
  }
}

const NO_ENTRY: Entry = {
  id: "",
  day: "",
  checkpoint: null,
  time: null,
  mine: null,
  theirs: null,
  goal: null,
  labels: [],
  note: null,
  review: null,
}

/**
 * What must hold of aph's entries, stated once, in code, and checked on
 * every write (`store.ts` refuses a write that breaks one). Each was a rule
 * consumers had to remember and, for a while, did not:
 *
 * - every id is unique;
 * - an entry's checkpoint, if it has one, is one of the settings';
 * - at most one plain (unlabelled) entry per checkpoint a day: the one
 *   `primary` reads, so a second would count in History and nowhere else;
 * - an entry at a checkpoint carries the goal it was made under, and one off
 *   the checkpoints carries none, so a delta never borrows today's goal;
 * - the clock time is written only off the checkpoints;
 * - an entry holds at least one figure, mine or theirs.
 *
 * Returns what is wrong, in words, so a test can say which rule broke.
 */
export function violations(
  settings: AphSettings,
  entries: ReadonlyArray<Entry>
): Array<string> {
  const wrong: Array<string> = []
  const ids = new Set<string>()
  const plain = new Set<string>()
  for (const e of entries) {
    if (ids.has(e.id)) wrong.push(`${e.id}: id used twice`)
    ids.add(e.id)
    if (e.mine === null && e.theirs === null) {
      wrong.push(`${e.id}: holds no figure`)
    }
    if (e.checkpoint === null) {
      if (e.goal !== null) wrong.push(`${e.id}: a goal off the checkpoints`)
      continue
    }
    if (checkpointById(settings, e.checkpoint) === null) {
      wrong.push(`${e.id}: unknown checkpoint ${e.checkpoint}`)
    }
    if (e.goal === null) wrong.push(`${e.id}: no goal at a checkpoint`)
    if (e.time !== null) wrong.push(`${e.id}: a clock time at a checkpoint`)
    if (e.labels.length === 0) {
      const slot = `${e.day} ${e.checkpoint}`
      if (plain.has(slot))
        wrong.push(`${e.id}: a second plain figure at ${slot}`)
      plain.add(slot)
    }
  }
  return wrong
}

/** "4,300", or "~4,300" for an approximate figure. */
export function formatValue(value: number, approx = false): string {
  return `${approx ? "~" : ""}${Math.round(value).toLocaleString("en-US")}`
}

/** "+360", "−330", "±0": a signed difference, with a real minus sign. */
export function formatDelta(value: number): string {
  const rounded = Math.round(value)
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "±"
  return `${sign}${Math.abs(rounded).toLocaleString("en-US")}`
}
