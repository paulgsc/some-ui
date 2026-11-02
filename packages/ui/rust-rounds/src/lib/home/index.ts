/**
 * Rust Rounds and the paired home (RR4b, #2347): one exchange sends each
 * round pasted on this phone that home does not hold yet, then reads the
 * rounds home holds and, for each the phone lacks or holds a card of
 * without a run, the round with every run home's rust-runner recorded of
 * its programs (paulgsc/server `handlers/rust_rounds.rs`; the shapes are
 * `packages/contract-harness/contracts/rust-rounds.contract.ts`). What comes
 * back is added to what plays (`lib/play/held`'s `mergeHeld`): a round the
 * phone lacks is appended, and a card's run is filled in once.
 *
 * The exchange is the phone's home-link lane's (apps/www
 * `lib/home-link/rust-rounds.ts`, LA15): it never runs from a screen, and no
 * screen waits on it. The session plays from what the phone holds, before,
 * during and after.
 *
 * - **Only a recorded run plays.** Home keeps a program it refused, or lost
 *   the runner on twice, as a `stopped` run that printed nothing, which
 *   would read as the program's own failure. Those cards keep saying no run
 *   is on the phone.
 * - **A round is one round.** A round home holds under an id the phone
 *   holds other cards under is left on home; the phone's plays, and none of
 *   home's runs is put on its cards.
 * - **Bounded.** One `PUT` per round waiting to go, one list, and at most
 *   `READS_PER_EXCHANGE` rounds read, newest first; the rest are read by a
 *   later exchange. A round the phone can't read is not read again.
 * - **Each answer is kept as it lands**, read fresh from the store and
 *   written back at once, so an exchange stopped part way keeps what came,
 *   and a round pasted meanwhile is not written over.
 */
import type { Round, RustcRun } from "@rust-rounds/lib/formats"
import {
  resolvePrograms,
  RoundSchema,
  RustcRunSchema,
} from "@rust-rounds/lib/formats"
import type { Held, HomeRefusal } from "@rust-rounds/lib/play/held"
import { cardKey, playable, runOf } from "@rust-rounds/lib/play/held"
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"
import { canonicalJson, readAs, unexpectedAnswer } from "@some-ui/core-utils"
import { z } from "zod"

/** The rounds home holds for this phone's person. */
const ROUNDS_PATH = "/rust-rounds"

/** One round on home, by its id. */
const roundPath = (id: string): string =>
  `${ROUNDS_PATH}/${encodeURIComponent(id)}`

/** How many rounds one exchange reads from home, at most. */
export const READS_PER_EXCHANGE = 20

/** What the exchange reads and writes of what plays. */
export type RoundsHomePort = {
  /** What plays, as stored now. */
  readonly held: () => Held
  /** Merges `held` into what is stored; false when the phone did not keep it. */
  readonly hold: (held: Held) => boolean
}

const RoundListSchema = z.object({
  rounds: z.array(z.object({ id: z.string() })),
})

const RoundWithRunsSchema = z.object({
  id: z.string(),
  round: z.unknown(),
  programs: z.array(
    z.object({
      card: z.string(),
      runs: z.array(z.object({ ended: z.string(), rustc: z.unknown() })),
    })
  ),
})

/** A round as home serves it, with the runs recorded of its programs. */
export type RoundFromHome = z.infer<typeof RoundWithRunsSchema>

/** The rounds taken on this phone that home neither holds nor refused. */
export function roundsToSend(held: Held): Array<Round> {
  const { sent, fetched, refused } = held.home
  const settled = new Set([...sent, ...fetched, ...refused.map(({ id }) => id)])
  return held.rounds.filter((round) => !settled.has(round.id))
}

/** How many rounds were taken on this phone: what the exchange would send moves with it. */
export const roundsTaken = (held: Held): number =>
  held.rounds.length - held.home.fetched.length

/** What the phone knows of home's rounds, counted, as a lane's sheet says it. */
export type RoundsCounts = {
  readonly onHome: number
  readonly refused: number
  readonly waiting: number
}

export function roundsCounts(held: Held): RoundsCounts {
  return {
    onHome: held.home.sent.length + held.home.fetched.length,
    refused: held.home.refused.length,
    waiting: roundsToSend(held).length,
  }
}

const withHome = (held: Held, home: Partial<Held["home"]>): Held => ({
  ...held,
  home: { ...held.home, ...home },
})

/**
 * What home's answer to a round sent says: it holds it (`201` added, `200`
 * the same round again), holds another under its id (`409`), or refused it
 * (`422`, `413`). Null for any other answer.
 */
function afterSend(held: Held, id: string, status: number): Held | null {
  const refused = (why: HomeRefusal["why"]): Held =>
    withHome(held, { refused: [...held.home.refused, { id, why }] })
  if (status === 200 || status === 201) {
    return withHome(held, { sent: [...held.home.sent, id] })
  }
  if (status === 409) return refused("other-round")
  if (status === 422 || status === 413) return refused("not-taken")
  return null
}

/**
 * The rounds home lists to read: first each the phone lacks, then each it
 * holds as home does with a card that has no run on the phone yet, each
 * newest first, as home lists them; none the phone holds other cards under,
 * can't read, or still has to send. At most `READS_PER_EXCHANGE`, so rounds
 * waiting on home's runs never keep a new round from coming.
 */
function roundsToRead(
  held: Held,
  listed: ReadonlyArray<string>
): Array<string> {
  const { sent, fetched, unread } = held.home
  const onHome = new Set([...sent, ...fetched])
  const skipped = new Set(unread)
  const rounds = playable(held)
  const lacking: Array<string> = []
  const unrun: Array<string> = []
  for (const id of listed) {
    if (skipped.has(id)) continue
    const mine = rounds.find((round) => round.id === id)
    if (mine === undefined) {
      lacking.push(id)
      continue
    }
    // The worked example is bundled with its runs; a round taken here is
    // home's only once home took it.
    if (mine !== rounds[0] && !onHome.has(id)) continue
    const programs = [...resolvePrograms(mine).keys()]
    if (programs.some((card) => runOf(held, { round: id, card }) === null)) {
      unrun.push(id)
    }
  }
  return [...lacking, ...unrun].slice(0, READS_PER_EXCHANGE)
}

/** The first run home recorded of a program, as the phone reads one. */
function recorded(
  runs: RoundFromHome["programs"][number]["runs"]
): RustcRun | null {
  for (const run of runs) {
    if (run.ended !== "recorded") continue
    const read = RustcRunSchema.safeParse(run.rustc)
    if (read.success) return read.data
  }
  return null
}

/**
 * `held` with what home holds of one round added: the round, if the phone
 * lacks it, and each card's first recorded run the phone has none of. A
 * round the phone can't read is noted, so it is not read again; one the
 * phone holds other cards under is left as it is.
 */
function takeFromHome(held: Held, from: RoundFromHome): Held {
  const read = RoundSchema.safeParse(from.round)
  if (!read.success || read.data.id !== from.id) {
    return withHome(held, { unread: [...held.home.unread, from.id] })
  }
  const round = read.data
  const mine = playable(held).find((each) => each.id === round.id)
  if (mine !== undefined && canonicalJson(mine) !== canonicalJson(round)) {
    return held
  }
  const programs = resolvePrograms(round)
  const runs: Record<string, RustcRun> = { ...held.runs }
  for (const program of from.programs) {
    const key = cardKey({ round: round.id, card: program.card })
    if (!programs.has(program.card) || runs[key] !== undefined) continue
    const run = recorded(program.runs)
    if (run !== null) runs[key] = run
  }
  const taken =
    mine === undefined
      ? {
          rounds: [...held.rounds, round],
          home: { ...held.home, fetched: [...held.home.fetched, round.id] },
        }
      : {}
  return { ...held, runs, ...taken }
}

const FORGOTTEN: HomeExchanged = { kind: "forgotten" }

/** The phone could not keep what it was sent: its own fault, said as such. */
const NOT_KEPT: HomeExchanged = { kind: "failed", why: "fault" }

/**
 * One exchange through `send`: each round waiting goes home, then what home
 * holds comes back. Throws what `send` throws.
 */
export async function exchangeRounds(
  port: RoundsHomePort,
  send: HomeCall
): Promise<HomeExchanged> {
  /** Applies `change` to what is stored now, and keeps it. */
  const keep = (change: (held: Held) => Held | null): boolean | null => {
    const now = port.held()
    const next = change(now)
    if (next === null) return null
    return next === now || port.hold(next)
  }

  for (const round of roundsToSend(port.held())) {
    const answer = await send("PUT", roundPath(round.id), JSON.stringify(round))
    if (answer.status === 401) return FORGOTTEN
    const kept = keep((held) => afterSend(held, round.id, answer.status))
    if (kept === null) return unexpectedAnswer("a round", answer.status)
    if (!kept) return NOT_KEPT
  }

  const list = await send("GET", ROUNDS_PATH)
  if (list.status === 401) return FORGOTTEN
  if (list.status !== 200) return unexpectedAnswer("the rounds", list.status)
  const listed = readAs(RoundListSchema, list.body)
  if (listed === null) return { kind: "failed", why: "the rounds: unreadable" }

  const ids = listed.rounds.map(({ id }) => id)
  for (const id of roundsToRead(port.held(), ids)) {
    const answer = await send("GET", roundPath(id))
    if (answer.status === 401) return FORGOTTEN
    // Gone since it was listed (a round goes only with its account).
    if (answer.status === 404) continue
    if (answer.status !== 200) return unexpectedAnswer("a round", answer.status)
    const from = readAs(RoundWithRunsSchema, answer.body)
    const kept = keep((held) =>
      from === null
        ? { ...held, home: { ...held.home, unread: [...held.home.unread, id] } }
        : takeFromHome(held, from)
    )
    if (kept === false) return NOT_KEPT
  }
  return { kind: "synced" }
}
