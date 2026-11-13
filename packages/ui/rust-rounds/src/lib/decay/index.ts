/**
 * The decay record (RR19, paulgsc/some-ui#2695): what the owner knows of
 * each concept over the weeks, so the essay can tell what was never known
 * from what was known and then decayed. Rust, like Korean, decays (owner,
 * 2026-11-07); the point is coming back every week, with no finishing.
 *
 * **Where it lives** (C267): nowhere new. Home already keeps, append-only,
 * each week (its tickets and the concepts each names) and each essay (the
 * SOLO level of each answer, or its silence). The record is derived from
 * them on every run, so it holds exactly what the essays judged and can't
 * drift from them. It reads plain checks (`Judged`), so another track (the
 * Korean one, say) can feed it its own.
 *
 * **The states** of a concept in a week (`CellOf`):
 *
 * - **shown**, at a SOLO level; below relational it is **met, not yet
 *   known**;
 * - **decayed**: an answer came back lower than an earlier week's. Observed;
 * - **may have faded**: known, not checked since, and past its recheck.
 *   Presumed, never observed;
 * - **not answered**: every ticket naming it was left silent;
 * - **not met yet**, or not checked that week.
 *
 * **When it comes back** is the Leitner system (C268; video-render's
 * `LEITNER`, which the chart cites): five
 * boxes, rechecked after 1, 2, 4, 8 and 16 weeks. An answer at relational or
 * above that didn't decay moves the concept up a box; anything else, a
 * silence included, sends it back to box 1.
 *
 * **The role line** is the Dreyfus model of skill acquisition, fitted by a
 * stated rule over the record (C269; `roleAt`), across at least three weeks
 * of answers, never one.
 */
import { LEITNER, SOLO_KNOWN, SOLO_LEVELS } from "@some-ui/video-render"
import type { Essay, EssayCell } from "@some-ui/video-render"

/** A concept, by the stable id a week's tickets name it by. */
export type Concept = { readonly id: string; readonly name: string }

/** One week's judged tickets: each one's concepts and SOLO level, or null for a silence. */
export type Judged = {
  readonly week: string
  readonly tickets: ReadonlyArray<{
    readonly concepts: ReadonlyArray<Concept>
    readonly level: number | null
  }>
}

/** A week a concept was checked in: the highest level of the tickets naming it, or null when all were silent. */
type Check = { readonly week: string; readonly level: number | null }

/** One concept's checks, oldest first. */
export type ConceptRecord = Concept & { readonly checks: ReadonlyArray<Check> }

/** The ISO week's Monday, as a count of weeks since 1970-01-05 (a Monday). */
function weekIndex(id: string): number {
  const [year, week] = id.split("-w").map(Number)
  if (year === undefined || week === undefined) return Number.NaN
  const jan4 = Date.UTC(year, 0, 4)
  const day = (new Date(jan4).getUTCDay() + 6) % 7
  const monday = jan4 - day * 86_400_000 + (week - 1) * 7 * 86_400_000
  return Math.round((monday - Date.UTC(1970, 0, 5)) / (7 * 86_400_000))
}

/** Whole weeks from week `from` to week `to`. */
export const weeksBetween = (from: string, to: string): number =>
  weekIndex(to) - weekIndex(from)

/** Each concept's checks, from the judged weeks in any order; concepts in first-met order. */
export function recordOf(
  judged: ReadonlyArray<Judged>
): ReadonlyArray<ConceptRecord> {
  const weeks = [...judged].sort((a, b) => (a.week < b.week ? -1 : 1))
  const byId = new Map<string, { name: string; checks: Array<Check> }>()
  for (const { week, tickets } of weeks) {
    const levels = new Map<string, { name: string; level: number | null }>()
    for (const ticket of tickets)
      for (const concept of ticket.concepts) {
        const held = levels.get(concept.id)
        const level =
          ticket.level === null
            ? (held?.level ?? null)
            : Math.max(held?.level ?? 0, ticket.level)
        levels.set(concept.id, { name: concept.name, level })
      }
    for (const [id, { name, level }] of levels) {
      const row = byId.get(id) ?? { name, checks: [] }
      row.checks.push({ week, level })
      byId.set(id, row)
    }
  }
  return [...byId].map(([id, row]) => ({ id, ...row }))
}

/** Where a concept stands after its checks up to and including `upTo`. */
type Standing = {
  readonly box: number
  readonly last: Check
  /** The highest level shown before `last`, and its week. */
  readonly best: { readonly level: number; readonly week: string } | null
  /** Whether `last` came back lower than `best`. */
  readonly decayed: boolean
}

function standingAt(record: ConceptRecord, upTo: string): Standing | null {
  let standing: Standing | null = null
  let best: Standing["best"] = null
  for (const check of record.checks) {
    if (check.week > upTo) break
    const decayed =
      check.level !== null && best !== null && check.level < best.level
    const known = check.level !== null && check.level >= SOLO_KNOWN
    const box: number =
      known && !decayed
        ? Math.min((standing?.box ?? 1) + 1, LEITNER.weeks.length)
        : 1
    standing = { box, last: check, best, decayed }
    if (check.level !== null && (best === null || check.level > best.level))
      best = { level: check.level, week: check.week }
  }
  return standing
}

/** Whether a concept stands past its recheck at `week`. */
const overdue = (standing: Standing, week: string): number =>
  weeksBetween(standing.last.week, week) -
  (LEITNER.weeks[standing.box - 1] ?? Infinity)

const isKnown = (standing: Standing): boolean =>
  standing.last.level !== null &&
  standing.last.level >= SOLO_KNOWN &&
  !standing.decayed

/** A concept's cell in `week`, as the essay's chart draws it. */
export function cellOf(record: ConceptRecord, week: string): EssayCell {
  const check = record.checks.find((c) => c.week === week)
  if (check !== undefined) {
    if (check.level === null) return "silent"
    const standing = standingAt(record, week)
    if (standing?.decayed === true && standing.best !== null)
      return { level: check.level, below: standing.best.week }
    return check.level
  }
  const before = record.checks.filter((c) => c.week < week).at(-1)
  if (before === undefined) return "unmet"
  const standing = standingAt(record, before.week)
  if (standing !== null && isKnown(standing) && overdue(standing, week) >= 0)
    return "faded"
  return "unmet"
}

/** Why a concept is due a recheck, in the order the routine takes them. */
const DUE_WHY = ["decayed", "faded", "not-yet-known"] as const
type DueWhy = (typeof DUE_WHY)[number]

export type DueConcept = Concept & {
  readonly why: DueWhy
  /** The week it was last checked in. */
  readonly last: string
}

/**
 * The concepts due a recheck in `week` (C268): decayed first, then those
 * that may have faded, then those met and not yet known; within each, the
 * longest overdue first, ties by id. A concept a week named whose essay
 * isn't written yet (`pending`) isn't due: its answer is still to be read.
 */
export function dueAt(
  record: ReadonlyArray<ConceptRecord>,
  week: string,
  pending: ReadonlySet<string> = new Set()
): ReadonlyArray<DueConcept> {
  const due: Array<DueConcept & { readonly late: number }> = []
  for (const concept of record) {
    if (pending.has(concept.id)) continue
    const standing = standingAt(concept, week)
    if (standing === null || standing.last.week >= week) continue
    const late = overdue(standing, week)
    if (late < 0) continue
    const why: DueWhy = standing.decayed
      ? "decayed"
      : isKnown(standing)
        ? "faded"
        : "not-yet-known"
    due.push({
      id: concept.id,
      name: concept.name,
      why,
      last: standing.last.week,
      late,
    })
  }
  return due
    .sort(
      (a, b) =>
        DUE_WHY.indexOf(a.why) - DUE_WHY.indexOf(b.why) ||
        b.late - a.late ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    )
    .map(({ late: _late, ...concept }) => concept)
}

/**
 * The Dreyfus model of skill acquisition (Dreyfus & Dreyfus, 1980), each
 * stage beside the SOLO level a concept's answer must hold for it (C269).
 * Expert has none: a spoken explanation of a ticket can't show it.
 */
const DREYFUS = {
  ladder: "The Dreyfus model of skill acquisition",
  source: "Dreyfus & Dreyfus, 1980",
  stages: [
    { name: "Novice", solo: 1 },
    { name: "Advanced beginner", solo: 3 },
    { name: "Competent", solo: 4 },
    { name: "Proficient", solo: 5 },
    { name: "Expert", solo: null },
  ],
} as const

/** The fewest weeks with an answer the role line is read across. */
const ROLE_WEEKS_LEAST = 3

/** The level a concept holds at `week`: its last answer's, nothing if silent or faded. */
function heldAt(record: ConceptRecord, week: string): number {
  const level = standingAt(record, week)?.last.level ?? null
  if (level === null || cellOf(record, week) === "faded") return 0
  return level
}

/** The Dreyfus stage held at `week`, by its index, or null before three weeks of answers. */
function stageAt(
  record: ReadonlyArray<ConceptRecord>,
  week: string
): { stage: number; held: ReadonlyArray<number> } | null {
  const answered = new Set(
    record.flatMap((c) =>
      c.checks
        .filter((k) => k.week <= week && k.level !== null)
        .map((k) => k.week)
    )
  )
  if (answered.size < ROLE_WEEKS_LEAST) return null
  const met = record.filter((c) => c.checks.some((k) => k.week <= week))
  const held = met.map((c) => heldAt(c, week))
  let stage = 0
  DREYFUS.stages.forEach(({ solo }, i) => {
    if (solo === null) return
    if (2 * held.filter((level) => level >= solo).length >= held.length)
      stage = i
  })
  return { stage, held }
}

const NOT_YET: Essay["weeks"]["role"] = {
  ladder: DREYFUS.ladder,
  source: DREYFUS.source,
  fits: "Not worked out yet",
  next: `Read across at least ${ROLE_WEEKS_LEAST} weeks of answers`,
  gap: `The fit is read from each concept's SOLO level across weeks, never from one week, and there aren't ${ROLE_WEEKS_LEAST} weeks of answers yet.`,
}

/**
 * The role line at `week`, over the weeks `weeks` (oldest first): the
 * Dreyfus stage whose SOLO level at least half the concepts met hold now
 * (their last answer, silence and fading holding none), the week it has
 * held since, and the gap to the next stage in its own terms (C269).
 */
export function roleAt(
  record: ReadonlyArray<ConceptRecord>,
  weeks: ReadonlyArray<string>
): Essay["weeks"]["role"] {
  const week = weeks.at(-1)
  if (week === undefined) return NOT_YET
  const now = stageAt(record, week)
  if (now === null) return NOT_YET
  let since = week
  for (const earlier of [...weeks].reverse().slice(1)) {
    if (stageAt(record, earlier)?.stage !== now.stage) break
    since = earlier
  }
  const fits = DREYFUS.stages[now.stage]?.name ?? "Novice"
  const next = DREYFUS.stages[now.stage + 1]
  const solo = next?.solo ?? null
  const gap =
    next === undefined
      ? "Expert is the ladder's last stage."
      : solo === null
        ? `${next.name} acts from intuition, which a spoken explanation of a ticket can't show.`
        : `${SOLO_LEVELS[solo - 1] ?? ""} or above on at least half the concepts met: ${now.held.filter((level) => level >= solo).length} of ${now.held.length} are now, and it takes ${Math.ceil(now.held.length / 2)}.`
  return {
    ladder: DREYFUS.ladder,
    source: DREYFUS.source,
    fits: `${fits}, since week ${String(Number(since.split("-w")[1]))}`,
    next: next?.name ?? fits,
    gap,
  }
}

/** The most concepts and weeks the chart draws. */
export type ChartBounds = { readonly weeks: number; readonly concepts: number }

/**
 * The essay's chart for the week `weeks` ends on: a row for each concept
 * that week's tickets named, in their order, then the others met in the
 * weeks shown, the most recently checked first, up to `bounds`.
 */
export function chartOf(
  record: ReadonlyArray<ConceptRecord>,
  judged: ReadonlyArray<string>,
  first: ReadonlyArray<Concept>,
  bounds: ChartBounds
): Pick<Essay["weeks"], "weeks" | "concepts"> {
  const weeks = [...judged].sort().slice(-bounds.weeks)
  const shown = record.filter((c) =>
    c.checks.some((k) => weeks.includes(k.week))
  )
  const lastIn = (c: ConceptRecord): string =>
    c.checks.filter((k) => weeks.includes(k.week)).at(-1)?.week ?? ""
  const order = [
    ...first.flatMap((c) => shown.filter((s) => s.id === c.id)),
    ...shown
      .filter((s) => !first.some((c) => c.id === s.id))
      .sort((a, b) =>
        lastIn(a) > lastIn(b) ? -1 : lastIn(a) < lastIn(b) ? 1 : 0
      ),
  ]
  const rows = [...new Map(order.map((c) => [c.id, c])).values()].slice(
    0,
    bounds.concepts
  )
  return {
    weeks,
    concepts: rows.map((c) => ({
      name: c.name,
      cells: weeks.map((week) => cellOf(c, week)),
    })),
  }
}
