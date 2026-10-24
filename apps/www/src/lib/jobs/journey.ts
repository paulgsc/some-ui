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
 * A digest names in `read` every file its run took in: an event is read once
 * a run named any file that carried it, and missed when the last file that
 * carried it went home and a later run went by without naming one.
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
 *   person looks, after a relaunch, a run going by); the order of shares (an
 *   unconfirmed share, then a filing, then its confirmation; something added
 *   after an unconfirmed share; a restored log).
 * - Tolerance: the mailbox's own states wait on home saying what it handed
 *   on (S0), so `with-home` stands in for them. A share confirmed in Drive
 *   stays "In Drive" until a run names it: no run is counted as missing a
 *   Drive file, since the next one reads every file no digest named.
 * - Proof: `__tests__/journey.test.ts` derives each state of the union from
 *   a record built for it, and `components/__tests__/journey-status.test.tsx`
 *   renders every state.
 */
import { assertNever } from "@some-ui/core-utils"

import type { Journey } from "@/lib/journey"
import { journey, mostUrgent } from "@/lib/journey"

import type { Outgoing } from "./files"
import { isFile } from "./files"
import type { JobEvent, JobsState, ShareKind } from "./model"
import { coveredBy, DIGESTS_KEPT } from "./model"

/** How long home takes to hand a file to the mailbox (its 900-second pass). */
export const HANDOVER_MS = 15 * 60_000

/**
 * How long after it starts a run may make its digest: it reads the mailbox
 * first, so a file handed on while it ran may come to the next run instead.
 */
const RUN_MS = 60 * 60_000

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
  /** Where what it carried ends (`coveredBy`). */
  readonly through: number
  readonly arrival: ArrivedEvent | null
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

/** The digests the phone held by `asOf`, oldest run first. */
function knownBy(state: JobsState, asOf: number): JobsState["digests"] {
  return [...state.digests]
    .filter((d) => at(state.firstOpened[d.day] ?? d.createdAt) <= asOf)
    .sort((a, b) => at(a.createdAt) - at(b.createdAt))
}

/** Where an event stands among the files that carried it, by a time. */
type Fate =
  | { kind: "read"; leg: ShareLeg; day: string }
  | { kind: "missed"; leg: ShareLeg; day: string }
  | { kind: "on-way"; leg: ShareLeg }
  | { kind: "too-old" }
  /** No file that carried it had arrived. */
  | { kind: "unsent"; unconfirmed: boolean }

/**
 * The event at `index`, as the phone knew by `asOf`: read once a run named
 * any file that carried it; else missed when the last that arrived was filed
 * with home and a run made after home could hand it on went by without it;
 * else on its way.
 */
function fateOf(
  state: JobsState,
  legs: ReadonlyArray<ShareLeg>,
  index: number,
  asOf: number
): Fate {
  const known = knownBy(state, asOf)
  const carriers = legs.filter((l) => l.since <= index && index < l.through)
  for (const leg of carriers) {
    const run = known.find((d) => d.read.includes(leg.share.file))
    if (run) return { kind: "read", leg, day: run.day }
  }
  const arrived = carriers.filter(
    (l) => l.arrival !== null && at(l.arrival.at) <= asOf
  )
  const leg = arrived.at(-1)
  if (leg?.arrival == null) {
    return { kind: "unsent", unconfirmed: carriers.length > arrived.length }
  }
  const since = at(leg.arrival.at)
  if (since < horizon(state)) return { kind: "too-old" }
  // Come to the phone after the filing too: a phone's clock running behind
  // the run's can't make a run that went by early.
  const missed = leg.filed
    ? known.find(
        (d) =>
          at(d.createdAt) > since + HANDOVER_MS + RUN_MS &&
          at(state.firstOpened[d.day] ?? d.createdAt) > since
      )
    : undefined
  return missed
    ? { kind: "missed", leg, day: missed.day }
    : { kind: "on-way", leg }
}

/** The first event of `kind` before `end` a run missed, by `asOf`, or null. */
function firstMissed(
  state: JobsState,
  kind: ShareKind,
  legs: ReadonlyArray<ShareLeg>,
  end: number,
  asOf: number
): number | null {
  for (let i = 0; i < end; i += 1) {
    const e = state.log.at(i)
    if (e === undefined || kindOf(e) !== kind) continue
    if (fateOf(state, legs, i, asOf).kind === "missed") return i
  }
  return null
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
  const arrivals = new Map<string, { event: ArrivedEvent; index: number }>()
  state.log.forEach((e, index) => {
    if (e.type === "arrived" && !arrivals.has(e.shareId)) {
      arrivals.set(e.shareId, { event: e, index })
    }
  })
  state.log.forEach((e, index) => {
    if (e.type !== "shared" || e.kind !== kind) return
    const arrived = arrivals.get(e.id)
    const filed =
      arrived?.index === index + 1 &&
      Math.abs(at(arrived.event.at) - at(e.at)) <= FILED_WITHIN_MS
    // What had arrived when it was made; the sheet's file also took back
    // in what a run had missed, as `deliveryView` does.
    const missed = filed
      ? null
      : firstMissed(state, kind, legs, index, at(e.at))
    const last = legs
      .filter((l) => {
        const done = arrivals.get(l.share.id)
        return (
          done !== undefined &&
          done.index < index &&
          (missed === null || l.through <= missed)
        )
      })
      .at(-1)
    legs.push({
      share: e,
      index,
      since: last?.through ?? 0,
      through: coveredBy(e, index),
      arrival: arrived?.event ?? null,
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
 * that carried the first event a run missed, or anything after it, counted
 * as not arrived, so the file takes back in what that run never read.
 * Otherwise `state` itself.
 */
export function deliveryView(
  state: JobsState,
  kind: ShareKind,
  now: Date
): JobsState {
  const legs = ledger(state, kind)
  const missed = firstMissed(state, kind, legs, state.log.length, now.getTime())
  if (missed === null) return state
  const undone = new Set(
    legs.filter((l) => l.through > missed).map((l) => l.share.id)
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

/** Where `kind`'s file not yet shared is, or null when there is none. */
function outgoingJourney(ctx: JourneyContext, kind: ShareKind): Journey | null {
  const file = ctx.outgoing(kind)
  if (!isFile(file)) return null
  if (file.voice.length > 0) return journey("needs-sheet", { why: "voice" })
  if (!ctx.kept) return journey("needs-sheet", { why: "not-kept" })
  if (ctx.state.home.refusedFiles.includes(file.name)) {
    return journey("home-refused")
  }
  return journey("on-phone")
}

/** Where the event at `index` is now; null for one no file carries, or too old to say. */
export function eventJourney(
  ctx: JourneyContext,
  index: number
): Journey | null {
  const event = ctx.state.log.at(index)
  const kind = event === undefined || index < 0 ? null : kindOf(event)
  if (kind === null) return null
  const fate = fateOf(ctx.state, ledger(ctx.state, kind), index, Infinity)
  switch (fate.kind) {
    case "read": {
      const via = fate.leg.filed ? "home" : "drive"
      return journey("read", { via, runDay: fate.day })
    }
    case "missed": {
      const since = fate.leg.arrival?.at ?? null
      return journey("missed-run", { since, runDay: fate.day })
    }
    case "on-way": {
      const since = fate.leg.arrival?.at ?? null
      return journey(fate.leg.filed ? "with-home" : "in-drive", { since })
    }
    case "too-old": {
      return null
    }
    case "unsent": {
      return fate.unconfirmed
        ? journey("sheet-unconfirmed")
        : outgoingJourney(ctx, kind)
    }
    default: {
      return assertNever(fate)
    }
  }
}

/**
 * The state `kind`'s card wears: of its events and its file not yet sent,
 * the one most in need of the person, the newest first among equals. Null
 * before anything was offered.
 */
export function kindJourney(
  ctx: JourneyContext,
  kind: ShareKind
): Journey | null {
  const events: Array<Journey> = []
  ctx.state.log.forEach((e, index) => {
    if (kindOf(e) !== kind) return
    const j = eventJourney(ctx, index)
    if (j !== null) events.unshift(j)
  })
  const pending =
    unconfirmedShare(ctx.state, kind) === null
      ? outgoingJourney(ctx, kind)
      : journey("sheet-unconfirmed")
  return mostUrgent([...(pending === null ? [] : [pending]), ...events])
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
