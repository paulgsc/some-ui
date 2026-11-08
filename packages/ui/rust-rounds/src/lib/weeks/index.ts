/**
 * The weeks this phone holds (RR13, paulgsc/some-ui#2688): each week the
 * routine wrote and home keeps (RR12), with rustc's recorded result for
 * each ticket's program once home's `rust-runner` has one, read from home
 * by `exchangeWeeks` and kept here, so a week plays from what the phone
 * holds, before, during and after a run, and with no home at all.
 *
 * A week is the routine's: the phone never writes one home, and takes one
 * only through `readWeek` (`lib/week-check`), the one door a week comes in by.
 *
 * - **A week is one week.** The first copy the phone reads of a week id is
 *   the one it keeps; a copy home holds under the same id with other
 *   content is left on home, so the tickets a draft answers never change
 *   under it.
 * - **Only a recorded run plays**, as for a round (`lib/home`): a program
 *   home refused or lost the runner on is ended for good and waits no more.
 * - **Bounded.** One list, and at most `WEEK_READS_PER_EXCHANGE` weeks read,
 *   newest first: those the phone lacks, then those with a ticket still
 *   waiting on its run. A week the phone can't read is not read again,
 *   and home saying it is busy (`429`) ends the reads there (AD3).
 * - **Each answer is kept as it lands**, read fresh and written back at once.
 *
 * The exchange runs in the phone's Rust Rounds lane (apps/www
 * `lib/home-link/rust-rounds.ts`, LA15), after the rounds'; no screen waits
 * on it.
 */
import type { RustcRun } from "@rust-rounds/lib/formats"
import { RustcRunSchema } from "@rust-rounds/lib/formats"
import type { Week } from "@rust-rounds/lib/formats/week"
import { WeekSchema } from "@rust-rounds/lib/formats/week"
import type { RoundsHomePort } from "@rust-rounds/lib/home"
import { exchangeRounds } from "@rust-rounds/lib/home"
import { WEEKS_KEY } from "@rust-rounds/lib/play/keys"
import { readWeek } from "@rust-rounds/lib/week-check"
import type { HomeCall, HomeExchanged, KeyedStorage } from "@some-ui/core-utils"
import {
  openKept,
  readAs,
  readJson,
  unexpectedAnswer,
  writeKept,
} from "@some-ui/core-utils"
import { z } from "zod"

/** The weeks home holds for this phone's person. */
const WEEKS_PATH = "/rust-weeks"

const weekPath = (id: string): string =>
  `${WEEKS_PATH}/${encodeURIComponent(id)}`

/** How many weeks one exchange reads from home, at most. */
export const WEEK_READS_PER_EXCHANGE = 4

export type HeldWeek = {
  readonly week: Week
  /** The SHA-256 home lists it by: the copy this phone keeps. */
  readonly sha256: string
  /** rustc's recorded result for each ticket's program, by ticket. */
  readonly runs: Readonly<Partial<Record<string, RustcRun>>>
  /** Tickets home ended for good with no recording this phone can play. */
  readonly ended: ReadonlyArray<string>
}

export type WeeksHeld = {
  /** In the order they came: each exchange adds the weeks it reads newest first. */
  readonly weeks: ReadonlyArray<HeldWeek>
  /** Weeks home served that this phone can't read, as `<id>@<sha256>`. */
  readonly unread: ReadonlyArray<string>
}

const NO_WEEKS: WeeksHeld = { weeks: [], unread: [] }

const HeldWeekSchema = z.object({
  week: WeekSchema,
  sha256: z.string(),
  runs: z.record(z.string(), RustcRunSchema),
  ended: z.array(z.string()),
})

const WeeksSchema = z.object({
  weeks: z.array(HeldWeekSchema),
  unread: z.array(z.string()),
})

const readWeeks = readJson((value) => {
  const parsed = WeeksSchema.safeParse(value)
  return parsed.success ? parsed.data : null
})

export type WeeksStore = {
  /** The weeks as stored now. */
  readonly held: () => WeeksHeld
  /** Keeps `held` in place of what is stored; false when not kept. */
  readonly hold: (held: WeeksHeld) => boolean
}

/** The weeks kept in `storage`; with none, nothing is kept. */
export function keptWeeks(storage: KeyedStorage | null): WeeksStore {
  return {
    held: () => openKept(storage, WEEKS_KEY, readWeeks, NO_WEEKS).value,
    hold: (held) => writeKept(storage, WEEKS_KEY, held, readWeeks),
  }
}

/** The week this phone holds under `id`, if it holds one. */
export const heldWeek = (held: WeeksHeld, id: string): HeldWeek | null =>
  held.weeks.find((each) => each.week.id === id) ?? null

const EntrySchema = z.object({ id: z.string(), sha256: z.string() })
const ListSchema = z.object({ weeks: z.array(EntrySchema) })

const WeekWithRunsSchema = z.object({
  id: z.string(),
  sha256: z.string(),
  week: z.unknown(),
  tickets: z.array(
    z.object({
      ticket: z.string(),
      runs: z.array(z.object({ ended: z.string(), rustc: z.unknown() })),
    })
  ),
})

type WeekFromHome = z.infer<typeof WeekWithRunsSchema>

/** Whether a held week still has a ticket waiting on its run. */
const waits = (held: HeldWeek): boolean =>
  held.week.tickets.some(
    ({ id }) => held.runs[id] === undefined && !held.ended.includes(id)
  )

/** The weeks to read from home, as listed (newest first), bounded. */
function weeksToRead(
  held: WeeksHeld,
  listed: ReadonlyArray<z.infer<typeof EntrySchema>>
): Array<string> {
  const lacking: Array<string> = []
  const unrun: Array<string> = []
  for (const { id, sha256 } of listed) {
    if (held.unread.includes(`${id}@${sha256}`)) continue
    const mine = heldWeek(held, id)
    if (mine === null) lacking.push(id)
    else if (mine.sha256 === sha256 && waits(mine)) unrun.push(id)
  }
  return [...lacking, ...unrun].slice(0, WEEK_READS_PER_EXCHANGE)
}

/** The first run home recorded of a program, as the phone reads one. */
function recorded(
  runs: WeekFromHome["tickets"][number]["runs"]
): RustcRun | null {
  for (const run of runs) {
    if (run.ended !== "recorded") continue
    const read = RustcRunSchema.safeParse(run.rustc)
    if (read.success) return read.data
  }
  return null
}

/** `held` with what home holds of one week added (the module's rules). */
function takeFromHome(held: WeeksHeld, from: WeekFromHome): WeeksHeld {
  const reading = readWeek(from.week)
  if (!reading.ok || reading.week.id !== from.id) {
    return { ...held, unread: [...held.unread, `${from.id}@${from.sha256}`] }
  }
  const mine = heldWeek(held, from.id)
  if (mine !== null && mine.sha256 !== from.sha256) return held
  const base: HeldWeek = mine ?? {
    week: reading.week,
    sha256: from.sha256,
    runs: {},
    ended: [],
  }
  const runs: Partial<Record<string, RustcRun>> = { ...base.runs }
  const ended = new Set(base.ended)
  const tickets = new Set(base.week.tickets.map(({ id }) => id))
  for (const { ticket, runs: kept } of from.tickets) {
    if (!tickets.has(ticket) || runs[ticket] !== undefined) continue
    const run = recorded(kept)
    // Every run home keeps has ended: refused, the runner lost twice, or
    // recorded in a shape this phone can't read.
    if (run !== null) runs[ticket] = run
    else if (kept.length > 0) ended.add(ticket)
  }
  const next: HeldWeek = { ...base, runs, ended: [...ended] }
  return mine === null
    ? { ...held, weeks: [...held.weeks, next] }
    : {
        ...held,
        weeks: held.weeks.map((each) => (each === mine ? next : each)),
      }
}

const FORGOTTEN: HomeExchanged = { kind: "forgotten" }

/** The phone could not keep what it was sent: its own fault, said as such. */
const NOT_KEPT: HomeExchanged = { kind: "failed", why: "fault" }

/** One exchange through `send`: what home holds of the weeks comes back. */
export async function exchangeWeeks(
  store: WeeksStore,
  send: HomeCall
): Promise<HomeExchanged> {
  const list = await send("GET", WEEKS_PATH)
  if (list.status === 401) return FORGOTTEN
  if (list.status !== 200) return unexpectedAnswer("the weeks", list.status)
  const listed = readAs(ListSchema, list.body)
  if (listed === null) return { kind: "failed", why: "the weeks: unreadable" }

  let failed: number | null = null
  for (const id of weeksToRead(store.held(), listed.weeks)) {
    const answer = await send("GET", weekPath(id))
    if (answer.status === 401) return FORGOTTEN
    if (answer.status === 404) continue
    // Home is busy: every read after this one would be turned away too.
    if (answer.status === 429) return unexpectedAnswer("a week", 429)
    if (answer.status !== 200) {
      failed ??= answer.status
      continue
    }
    const from = readAs(WeekWithRunsSchema, answer.body)
    const now = store.held()
    const sha256 = listed.weeks.find((each) => each.id === id)?.sha256 ?? ""
    const next =
      from === null
        ? { ...now, unread: [...now.unread, `${id}@${sha256}`] }
        : takeFromHome(now, from)
    if (next !== now && !store.hold(next)) return NOT_KEPT
  }
  return failed === null
    ? { kind: "synced" }
    : unexpectedAnswer("a week", failed)
}

/**
 * The lane's run: the rounds' exchange, then, once it is synced, the weeks'.
 * Throws what `send` throws.
 */
export async function exchangeRustRounds(
  rounds: RoundsHomePort,
  weeks: WeeksStore,
  send: HomeCall
): Promise<HomeExchanged> {
  const done = await exchangeRounds(rounds, send)
  return done.kind === "synced" ? exchangeWeeks(weeks, send) : done
}
