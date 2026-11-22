/**
 * What real use shows of each module and each place in it (WALK5, #3337;
 * the owner's call C861), as a walkthrough's render reads it: written by
 * `frictionOf` from home's weekly read (`GET /app-events/weeks/:week`, its
 * `seen` and `friction`, the same answer `reportWeeksOf` reads) and the
 * registry, and kept as `friction.json` beside the render, which
 * `pnpm report:vestiges --usage` reads too (#3338).
 *
 * Aggregates only, under the engagement report's public-safety rule (ask
 * #2701): every count is a `PublicCount`, "fewer than 5" below `UNDER`, a
 * count whose complement beside an exact figure would be under 5 is unsaid
 * (opened days beside `of`, C938; moved on beside the stretches), a median
 * is said only over 5 values or more, and nothing here names a pass
 * reason, a chip, a company, a role or any content. A module home can't
 * tell the opening of is `not-measured`, never silent.
 *
 * What home's measures can and can't tell apart (paulgsc/server's
 * `app_event::friction`), and so what this says: a stretch on a place ends
 * when it is left, so the app going to the back splits a step in two;
 * `movedOn` counts the stretches followed at once by a step on (or back, or
 * to the next item), and at an affordance's last place it is `no-data`.
 * Since #3367 (the owner's answer: yes) a `left` says the screen it went
 * to (`next`), so for an affordance the registry calls a flow, a stretch
 * that went to a screen outside it is `finished` at a place the flow
 * finishes at and `leftPartWay` at one it is left part-way at; any other
 * place says neither. They are said only over a window that starts after a
 * `left` with a `next` (home's `nextsBefore`), so an older build's
 * stretches are never missed from a count that reads as whole (a phone kept
 * on an older build after another moved on is the tolerance); until then
 * they are `no-data` and the walkthrough keeps saying moved on.
 */

import { addDays, isoWeekMonday } from "@some-ui/core-utils"
import { z } from "zod"

import type { Parsed } from "./cut-list"
import { once, problemsOf } from "./cut-list"
import { CountSchema, publicCount, UNDER } from "./engagement-report"
import type { PublicCount } from "./engagement-report"
import { HomeWeeksSchema } from "./engagement-report-video"

export const FRICTION_SCHEMA = "some-ui.friction/3"

/**
 * The days an aggregate looks back over: four weeks (C861, which allows
 * 28-day or all-time windows). How many whole weeks a silent module has
 * gone unopened (`weeksQuiet`) may be said too, past that window (the
 * owner's C937, #3408).
 */
export const FRICTION_WINDOW_DAYS = 28

const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export const FrictionSchema = z.strictObject({
  schema: z.literal(FRICTION_SCHEMA),
  /** The last day of the read's week (its Sunday): every figure is of the records before its end. */
  asOf: z.iso.date(),
  windowDays: z.literal(FRICTION_WINDOW_DAYS),
  /** Each module the build offers, by its pipeline in the registry, once. */
  modules: z.array(
    z.strictObject({
      pipeline: id,
      opened: z.discriminatedUnion("kind", [
        z.strictObject({
          kind: z.literal("measured"),
          /** Days of the window its root was shown on; `no-data` where the days not shown on would be under 5 (C938). */
          days: CountSchema,
          /** Days of the window home measured its root over: from its first event, at most the window. */
          of: z.int().min(1).max(FRICTION_WINDOW_DAYS),
          /** Whole weeks since it was last shown; null when home holds no showing of it. */
          weeksQuiet: z.int().min(0).nullable(),
        }),
        z.strictObject({ kind: z.literal("not-measured") }),
      ]),
    })
  ),
  /** Each place a `left` can name (`places` in the registry), over the window. */
  places: z.array(
    z.strictObject({
      pipeline: id,
      affordance: id,
      place: id,
      /** Stretches spent on it, each ended by leaving it. */
      stretchesLeft: CountSchema,
      /** Of those, the ones followed at once by a step on; `no-data` at the last place. */
      movedOn: CountSchema,
      /** At a place its flow finishes at, the stretches on it that ended by going to a screen outside the affordance (a pick's ending: a done pick, opened again and closed, counts too); `no-data` at any other place, or before every build said where it went. */
      finished: CountSchema,
      /** At a place its flow is left part-way at, the same: stretches that left the affordance from this step (one looked at again on a done pick counts too); `no-data` at any other place, or before every build said where it went. */
      leftPartWay: CountSchema,
      /** A stretch's median time on it, in ms; null under 5 stretches. */
      medianMs: z.int().min(0).nullable(),
    })
  ),
  /** Home read only the newest of the window's stretches, so no place's counts are said. */
  partial: z.boolean(),
  /** Applying's debrief: the friction the owner gave it, 1 to 5 (C861). */
  debrief: z.strictObject({
    said: CountSchema,
    /** Their median; null under 5. */
    median: z.number().min(1).max(5).nullable(),
  }),
})

export type Friction = z.infer<typeof FrictionSchema>

/** `raw` as a friction aggregate, or every reason it isn't one. */
export function parseFriction(raw: unknown): Parsed<Friction> {
  const parsed = FrictionSchema.safeParse(raw)
  if (!parsed.success)
    return { ok: false, problems: problemsOf(parsed.error, "friction") }
  const problems: Array<string> = []
  const modules = new Set<string>()
  for (const m of parsed.data.modules) {
    if (modules.has(m.pipeline)) problems.push(`${m.pipeline}: listed twice`)
    modules.add(m.pipeline)
  }
  const places = new Set<string>()
  for (const p of parsed.data.places) {
    const key = `${p.pipeline}/${p.affordance}/${p.place}`
    if (places.has(key)) problems.push(`${key}: listed twice`)
    places.add(key)
    // A median is said only over 5 stretches or more.
    if (p.medianMs !== null && typeof p.stretchesLeft !== "number")
      problems.push(`${key}: a median over fewer than ${String(UNDER)}`)
  }
  const { debrief } = parsed.data
  if (debrief.median !== null && typeof debrief.said !== "number")
    problems.push(`debrief: a median over fewer than ${String(UNDER)}`)
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, value: parsed.data }
}

/** The registry as `frictionOf` reads it: `@some-ui/engagement`'s `PIPELINES` fits it. */
export type FrictionRegistry = ReadonlyArray<{
  readonly id: string
  readonly opened:
    | { readonly kind: "root"; readonly affordance: string }
    | { readonly kind: "not-measured" }
  readonly affordances: ReadonlyArray<{
    readonly id: string
    readonly surface: string
    readonly offer: string | null
    readonly places?: ReadonlyArray<{ readonly id: string }>
    readonly flow?: {
      readonly finishedAt: ReadonlyArray<string>
      readonly partWayAt: ReadonlyArray<string>
    }
    readonly retired?: true
  }>
}>

/**
 * `parts`, counts of some of `whole`'s stretches, as said beside it: each
 * kept in order while what the kept ones leave of `whole` is 5 or more, and
 * `no-data` from the first that would leave less (ask #2701). A part said as
 * "fewer than 5" may be as many as 4, so it is taken as 4. The parts may
 * overlap, so what they leave may be more than this assumes: never less.
 * A `whole` that is not a number leaves each part as it is: none can be
 * more than it.
 */
function beside(
  whole: PublicCount,
  parts: ReadonlyArray<PublicCount>
): ReadonlyArray<PublicCount> {
  let left = typeof whole === "number" ? whole : null
  return parts.map((part) => {
    if (left === null || part === "no-data") return part
    const most = typeof part === "number" ? part : UNDER - 1
    if (left - most < UNDER) return "no-data"
    left -= most
    return part
  })
}

/** Whole days from `from` to `to`, two owner's days. */
const daysFrom = (from: string, to: string): number =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)

const keyOf = (...parts: ReadonlyArray<string>): string => parts.join("/")

/**
 * The aggregate a walkthrough reads, from home's weekly read `raw` over the
 * 28 days ending with its week, and `registry`, as of that week's last day
 * (`asOf`): home reads only the records before the week's end, so how long a
 * module has been quiet is counted to that day, never a later one.
 *
 * - A module is measured by its root (`opened`) only where the root is shown
 *   on screen: a root offered by notification counts notifications sent, so
 *   it is `not-measured`, as is a root home holds nothing of (no `seen`: it
 *   may not have been sending yet) or whose last showing home didn't keep (a
 *   week kept before the read said it).
 * - Its days are bounded by the root's first day: a root that began sending
 *   late is measured over fewer days (`of`), never read as quiet before.
 * - Every place of every affordance the registry offers is listed, with home's
 *   row for it on that affordance's surface, or none: no stretch (fewer than
 *   5) where the affordance was seen, else `no-data`. Where home read only
 *   part of the window (`partial`), its counts would undercount, so every
 *   place is `no-data`.
 *
 * Refuses a read with no friction measures (a week kept before home read
 * them) and one whose week isn't an ISO week.
 */
export function frictionOf(
  raw: unknown,
  registry: FrictionRegistry
): Parsed<Friction> {
  const parsed = HomeWeeksSchema.safeParse(raw)
  if (!parsed.success)
    return { ok: false, problems: problemsOf(parsed.error, "home's weeks") }
  const home = parsed.data
  const measures = home.friction
  if (measures === undefined)
    return {
      ok: false,
      problems: [`${home.week} was kept before home measured friction`],
    }
  let last: string
  try {
    last = addDays(isoWeekMonday(home.week), 6)
  } catch {
    return { ok: false, problems: [`week: ${home.week} is no ISO week`] }
  }
  const asOf = last
  const first = addDays(last, 1 - FRICTION_WINDOW_DAYS)
  const seen = new Map(
    (home.seen ?? []).map((s) => [
      keyOf(s.pipeline, s.affordance, s.surface),
      s,
    ])
  )
  const opened = new Map(
    measures.opened.map((o) => [
      keyOf(o.pipeline, o.affordance, o.surface),
      o.days,
    ])
  )
  const places = new Map(
    measures.places.map((p) => [
      keyOf(p.pipeline, p.affordance, p.surface, p.place),
      p,
    ])
  )
  const noData: PublicCount = "no-data"
  const modules = registry.map((pipeline): Friction["modules"][number] => {
    const notMeasured = {
      pipeline: pipeline.id,
      opened: { kind: "not-measured" as const },
    }
    if (pipeline.opened.kind !== "root") return notMeasured
    const rootId = pipeline.opened.affordance
    const root = pipeline.affordances.find((a) => a.id === rootId)
    if (root === undefined || root.offer === "notified") return notMeasured
    const key = keyOf(pipeline.id, root.id, root.surface)
    const its = seen.get(key)
    if (its?.lastOpenedDay === undefined) return notMeasured
    const since = its.firstDay > first ? its.firstDay : first
    const of = Math.min(measures.measuredDays, daysFrom(since, last) + 1)
    if (of < 1) return notMeasured
    const lastOpened = its.lastOpenedDay
    const openedDays = opened.get(key) ?? 0
    return {
      pipeline: pipeline.id,
      opened: {
        kind: "measured",
        // Said beside the exact days measured, an opened-days count would
        // give away the days not opened, under 5: it is left unsaid then,
        // as a moved-on count is (the owner's C938, #3409).
        days: of - openedDays < UNDER ? noData : publicCount(openedDays),
        of,
        weeksQuiet:
          lastOpened === null
            ? null
            : Math.max(0, Math.floor(daysFrom(lastOpened, asOf) / 7)),
      },
    }
  })
  const placeRows = registry.flatMap((pipeline) =>
    pipeline.affordances
      .filter((a) => a.retired !== true)
      .flatMap((a) => {
        const own = a.places ?? []
        const wasSeen =
          measures.measuredDays > 0 &&
          seen.has(keyOf(pipeline.id, a.id, a.surface))
        return own.map((place, i): Friction["places"][number] => {
          const row = places.get(keyOf(pipeline.id, a.id, a.surface, place.id))
          const isLast = i === own.length - 1
          const counts = (n: number): PublicCount =>
            measures.partial || !wasSeen ? noData : publicCount(n)
          const left = counts(row?.left ?? 0)
          const moved = isLast ? noData : counts(row?.movedOn ?? 0)
          // Only over a window that starts after a `left` said where it went
          // (#3367): before that, a build sent none, so a count of where
          // stretches went would miss some and still read as whole.
          const whole = measures.nextsBefore === true
          // A screen outside the affordance is never one of its own places
          // (`elsewhere` included: no place has that id).
          const inside = new Set(own.map((p) => p.id))
          const out = (row?.nexts ?? [])
            .filter((n) => !inside.has(n.next))
            .reduce((sum, n) => sum + n.left, 0)
          const went = whole ? counts(out) : noData
          const finished = a.flow?.finishedAt.includes(place.id) ? went : noData
          const partWay = a.flow?.partWayAt.includes(place.id) ? went : noData
          // Said beside the stretches, counts of some of them would give
          // away the rest, under 5 (ask #2701): what all the said counts
          // leave over must be 5 or more, so the newer ones go first.
          const [shownMoved, shownFinished, shownPartWay] = beside(left, [
            moved,
            finished,
            partWay,
          ])
          return {
            pipeline: pipeline.id,
            affordance: a.id,
            place: place.id,
            stretchesLeft: left,
            movedOn: shownMoved ?? noData,
            finished: shownFinished ?? noData,
            leftPartWay: shownPartWay ?? noData,
            medianMs: typeof left === "number" ? (row?.medianMs ?? null) : null,
          }
        })
      })
  )
  const { said, median } = measures.debrief
  const debriefSaid = measures.measuredDays > 0 ? publicCount(said) : noData
  const friction: Friction = {
    schema: FRICTION_SCHEMA,
    asOf,
    windowDays: FRICTION_WINDOW_DAYS,
    modules,
    places: placeRows,
    partial: measures.partial,
    debrief: {
      said: debriefSaid,
      median: typeof debriefSaid === "number" ? median : null,
    },
  }
  const checked = parseFriction(friction)
  return checked.ok ? checked : { ok: false, problems: once(checked.problems) }
}
