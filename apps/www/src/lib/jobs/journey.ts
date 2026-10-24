/**
 * Where the phone's decisions and scouts are now (J0), in the shared states
 * of `lib/journey`: read off the log and the digests, so each card
 * says where its file went without a tap ("never silent", JB2 below).
 *
 * Every `shared` event is one file that left, or was offered: by the share
 * sheet (to Drive), or filed with home by an exchange (`./home`), which hands
 * it to the run's mailbox. A filed share is recorded shared and arrived at
 * one instant (`filed` in `./runtime`); a person confirms a sheet's arrival
 * only after the sheet has closed, so no confirmed share is that close.
 * A digest names in `read` every file its run took in, so a file a newer run
 * did not name never reached it.
 *
 * What a share carried is what the log held after the share before it that
 * had arrived, as `./files` builds it: replayed here (`ledger`), share by
 * share, from the log as it stood when each was made. The share sheet's
 * file also takes back in what a run missed (`deliveryView`), so a share
 * made then carried that too.
 *
 * JB2 (promise, Change-Kind: defect):
 * - Claim: every control in the Jobs wing whose effect leaves the phone, or
 *   changes what will leave it, says on that surface where the effect is now.
 * - Family: the road (home without a tap, the share sheet, home refused, a
 *   missed run); the network (kept on home or not); timing (filed before the
 *   person looks, after a relaunch, a run going by).
 * - Proof: `__tests__/journey.test.ts` derives each state of the union from
 *   a record built for it, and `components/__tests__/journey-status.test.tsx`
 *   renders every state.
 */
import type { Journey } from "@/lib/journey"
import { journey, mostUrgent } from "@/lib/journey"

import type { Outgoing } from "./files"
import { isFile } from "./files"
import type { JobEvent, JobsState, ShareKind } from "./model"
import { DIGESTS_KEPT } from "./model"

/** How long home takes to hand a file to the mailbox (its 900-second pass). */
export const HANDOVER_MS = 15 * 60_000

/** A filed share's arrival is stamped with it; never a person's. */
const FILED_WITHIN_MS = 5

type SharedEvent = JobEvent & { type: "shared" }
type ArrivedEvent = JobEvent & { type: "arrived" }

/** One share of a kind, as the log says it went. */
type ShareLeg = {
  readonly share: SharedEvent
  readonly index: number
  /** The first place in the log it carried. */
  readonly since: number
  /** The log's length when it was made: it carried what came before. */
  readonly through: number
  readonly arrival: ArrivedEvent | null
  readonly arrivalIndex: number
  /** Filed with home by an exchange, not shared by the sheet. */
  readonly filed: boolean
}

/** Which file an event goes out in, or null for one no file carries. */
function kindOf(e: JobEvent): ShareKind | null {
  if (e.type === "scout") return "scouts"
  if ("pickId" in e || e.type === "outcome" || e.type === "disagree") {
    return "decisions"
  }
  return null
}

const at = (iso: string): number => Date.parse(iso)

/** When `day`'s digest came to this phone, as a time. */
function cameAt(state: JobsState, day: string, createdAt: string): number {
  return at(state.firstOpened[day] ?? createdAt)
}

/**
 * Before this, the phone may have let go of the digests that would say
 * whether a run read a file (`DIGESTS_KEPT`): a share older says nothing.
 */
function horizon(state: JobsState): number {
  if (state.digests.length < DIGESTS_KEPT) return -Infinity
  const created = state.digests
    .map((d) => at(d.createdAt))
    .sort((a, b) => a - b)
  return created[created.length - DIGESTS_KEPT] ?? -Infinity
}

/** The digest whose run read `file`, oldest first, if the phone holds one. */
function readBy(state: JobsState, file: string): string | null {
  return state.digests.find((d) => d.read.includes(file))?.day ?? null
}

/**
 * The run that should have read filed `leg` and didn't, as the phone knew
 * by `asOf`: the first digest made after home could hand it on, when no
 * digest the phone held then names it.
 */
function missedBy(
  state: JobsState,
  leg: ShareLeg,
  asOf: number
): string | null {
  if (!leg.filed || leg.arrival === null) return null
  const arrived = at(leg.arrival.at)
  if (arrived < horizon(state)) return null
  const known = [...state.digests]
    .filter((d) => cameAt(state, d.day, d.createdAt) <= asOf)
    .sort((a, b) => at(a.createdAt) - at(b.createdAt))
  if (known.some((d) => d.read.includes(leg.share.file))) return null
  // Made after home could hand it on, and come to the phone after it was
  // filed: a phone's clock running behind the run's can't make one early.
  return (
    known.find(
      (d) =>
        at(d.createdAt) > arrived + HANDOVER_MS &&
        cameAt(state, d.day, d.createdAt) > arrived
    )?.day ?? null
  )
}

/** A later share that had arrived by `asOf` carried all `leg` did. */
function superseded(
  legs: ReadonlyArray<ShareLeg>,
  leg: ShareLeg,
  asOf: number
): boolean {
  return legs.some(
    (l) =>
      l.index > leg.index &&
      l.arrival !== null &&
      at(l.arrival.at) <= asOf &&
      l.since <= leg.since
  )
}

/** The first share a run missed and nothing since has carried, by `asOf`. */
function firstMissed(
  state: JobsState,
  legs: ReadonlyArray<ShareLeg>,
  asOf: number
): ShareLeg | null {
  return (
    legs.find(
      (l) => missedBy(state, l, asOf) !== null && !superseded(legs, l, asOf)
    ) ?? null
  )
}

const ledgers = new WeakMap<
  JobsState,
  Map<ShareKind, ReadonlyArray<ShareLeg>>
>()

/** Every share of `kind`, in log order, with what each carried. */
function ledger(state: JobsState, kind: ShareKind): ReadonlyArray<ShareLeg> {
  const cached = ledgers.get(state)?.get(kind)
  if (cached) return cached
  const legs: Array<ShareLeg> = []
  state.log.forEach((e, index) => {
    if (e.type !== "shared" || e.kind !== kind) return
    const arrivalIndex = state.log.findIndex(
      (a) => a.type === "arrived" && a.shareId === e.id
    )
    const found = arrivalIndex < 0 ? undefined : state.log.at(arrivalIndex)
    const arrival = found?.type === "arrived" ? found : null
    const filed =
      arrival !== null &&
      arrivalIndex === index + 1 &&
      Math.abs(at(arrival.at) - at(e.at)) <= FILED_WITHIN_MS
    // What had arrived when it was made; the sheet's file also left out
    // what a run had missed, as `deliveryView` does now.
    let before = legs.filter(
      (l) => l.arrivalIndex >= 0 && l.arrivalIndex < index
    )
    if (!filed) {
      const missed = firstMissed(state, legs, at(e.at))
      if (missed !== null) before = before.filter((l) => l.index < missed.index)
    }
    const last = before.at(-1)
    legs.push({
      share: e,
      index,
      since: last === undefined ? 0 : Math.min(last.through, last.index),
      through: e.through,
      arrival,
      arrivalIndex,
      filed,
    })
  })
  const byKind =
    ledgers.get(state) ?? new Map<ShareKind, ReadonlyArray<ShareLeg>>()
  byKind.set(kind, legs)
  ledgers.set(state, byKind)
  return legs
}

/**
 * `state` as the share sheet builds `kind`'s file from it: with every share
 * from the first one a run missed (and nothing since carried) counted as not
 * arrived, so the file takes back in what that run never read. Otherwise
 * `state` itself.
 */
export function deliveryView(
  state: JobsState,
  kind: ShareKind,
  now: Date
): JobsState {
  const legs = ledger(state, kind)
  const missed = firstMissed(state, legs, now.getTime())
  if (missed === null) return state
  const undone = new Set(
    legs.filter((l) => l.index >= missed.index).map((l) => l.share.id)
  )
  return {
    ...state,
    log: state.log.map((e) =>
      e.type === "arrived" && undone.has(e.shareId)
        ? { ...e, shareId: `${e.shareId} (missed)` }
        : e
    ),
  }
}

/** Where an arrived share is now, or null for one too old to say. */
function arrivedJourney(state: JobsState, leg: ShareLeg): Journey | null {
  if (leg.arrival === null) return null
  const via = leg.filed ? "home" : "drive"
  const runDay = readBy(state, leg.share.file)
  if (runDay !== null) return journey("read", { via, runDay })
  if (at(leg.arrival.at) < horizon(state)) return null
  const since = leg.arrival.at
  if (!leg.filed) return journey("in-drive", { since })
  const missed = missedBy(state, leg, Infinity)
  return missed === null
    ? journey("with-home", { since })
    : journey("missed-run", { since, runDay: missed })
}

/** What a card reads its state from. */
export type JourneyContext = {
  readonly state: JobsState
  /** Jobs is kept on the paired home, so an exchange files its files. */
  readonly kept: boolean
  /** The file of each kind an exchange would file now (`keeping.outgoing`). */
  readonly outgoing: (kind: ShareKind) => Outgoing
}

/** A share of `kind` the sheet made since the last that arrived, unconfirmed. */
export function unconfirmedShare(
  state: JobsState,
  kind: ShareKind
): SharedEvent | null {
  const legs = ledger(state, kind)
  const last = legs.filter((l) => l.arrival !== null).at(-1)
  const after = legs.filter(
    (l) => l.arrival === null && (last === undefined || l.index > last.index)
  )
  return after.at(-1)?.share ?? null
}

/** Where `kind`'s file not yet sent is, or null when there is none. */
function pendingJourney(ctx: JourneyContext, kind: ShareKind): Journey | null {
  if (unconfirmedShare(ctx.state, kind) !== null) {
    return journey("sheet-unconfirmed")
  }
  const file = ctx.outgoing(kind)
  if (!isFile(file)) return null
  if (file.voice.length > 0) return journey("needs-sheet", { why: "voice" })
  if (!ctx.kept) return journey("needs-sheet", { why: "not-kept" })
  if (ctx.state.home.refusedFiles.includes(file.name)) {
    return journey("home-refused")
  }
  return journey("on-phone")
}

/**
 * Where the event at `index` is: read if a file that carried it was read;
 * else as the last carrier that arrived; else waiting to go. Null for an
 * event no file carries, or one too old to say.
 */
export function eventJourney(
  ctx: JourneyContext,
  index: number
): Journey | null {
  const event = ctx.state.log.at(index)
  const kind = event === undefined || index < 0 ? null : kindOf(event)
  if (kind === null) return null
  const carriers = ledger(ctx.state, kind).filter(
    (l) => l.since <= index && index < l.through
  )
  const arrived = carriers.filter((l) => l.arrival !== null)
  const read = arrived
    .map((l) => arrivedJourney(ctx.state, l))
    .find((j) => j?.id === "read")
  if (read) return read
  const last = arrived.at(-1)
  if (last !== undefined) return arrivedJourney(ctx.state, last)
  return pendingJourney(ctx, kind)
}

/**
 * The state `kind`'s card wears: of its files not yet sent and every share
 * that arrived and no later one carried again, the one most in need of the
 * person, the newest first among equals. Null before anything was offered.
 */
export function kindJourney(
  ctx: JourneyContext,
  kind: ShareKind
): Journey | null {
  const legs = ledger(ctx.state, kind)
  const standing = legs
    .filter((l) => l.arrival !== null && !superseded(legs, l, Infinity))
    .map((l) => arrivedJourney(ctx.state, l))
    .filter((j): j is Journey => j !== null)
  const pending = pendingJourney(ctx, kind)
  return mostUrgent([
    ...(pending === null ? [] : [pending]),
    ...standing.reverse(),
  ])
}

/** The last picks let go together, and when, or null if none were. */
export function lastLetGo(
  state: JobsState
): { at: string; count: number; indices: ReadonlyArray<number> } | null {
  const last = state.log.map((e) => e.type).lastIndexOf("archived")
  if (last < 0) return null
  const indices: Array<number> = []
  for (let i = last; i >= 0 && state.log.at(i)?.type === "archived"; i -= 1) {
    indices.unshift(i)
  }
  const first = state.log.at(indices[0] ?? last)
  return first ? { at: first.at, count: indices.length, indices } : null
}
