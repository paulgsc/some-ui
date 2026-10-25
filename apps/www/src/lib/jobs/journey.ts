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
 * What a share carried runs from where its file began, which the phone
 * notes as it records the share (`carried`), to its `through`. The share
 * sheet's file also takes back in what a run missed (`deliveryView`), so
 * where it began can be earlier than the last share that arrived.
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
 *   Drive file, since the next one reads every file no digest named. A
 *   phone restored from home has lost its notes of where shares began
 *   (`carried`): a reshare it made after a missed run counts from the last
 *   share that had arrived, so what that run missed reads as missed, even
 *   once a run read the reshare, until it is shared once more.
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
import { coveredBy, DIGESTS_KEPT, isPickStep } from "./model"

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
  /** Where its arrival sits in the log, or -1. */
  readonly arrivalIndex: number
  /** Filed with home by an exchange, not shared by the sheet. */
  readonly filed: boolean
}

/** Which file an event goes out in, or null for one no file carries. */
function kindOf(e: JobEvent): ShareKind | null {
  if (e.type === "scout") return "scouts"
  if (isPickStep(e) || e.type === "outcome" || e.type === "disagree") {
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

/** The runs the phone held by `asOf`, as each fate needs them. */
type Runs = {
  /** Each file a run named, and the first run that did. */
  readonly read: ReadonlyMap<string, string>
  /** Each run: when it was made and when it reached the phone, oldest first. */
  readonly made: ReadonlyArray<{ day: string; created: number; came: number }>
  readonly horizon: number
}

function runsBy(state: JobsState, asOf: number): Runs {
  const made = state.digests
    .map((d) => ({
      day: d.day,
      read: d.read,
      created: at(d.createdAt),
      came: at(state.firstOpened[d.day] ?? d.createdAt),
    }))
    .filter((d) => d.came <= asOf)
    .sort((a, b) => a.created - b.created)
  const read = new Map<string, string>()
  for (const d of made)
    for (const f of d.read) if (!read.has(f)) read.set(f, d.day)
  return { read, made, horizon: horizon(state) }
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
 * The event at `index`, by `asOf`: read once a run named any file that
 * carried it; else, by the file that carried it to arrive last, missed when
 * that file went home and a run made well after home could hand it on went
 * by without it; else on its way.
 */
function fateOf(
  legs: ReadonlyArray<ShareLeg>,
  runs: Runs,
  index: number,
  asOf: number
): Fate {
  const carriers = legs.filter((l) => l.since <= index && index < l.through)
  for (const leg of carriers) {
    const day = runs.read.get(leg.share.file)
    if (day !== undefined) return { kind: "read", leg, day }
  }
  const arrived = carriers
    .filter((l) => l.arrival !== null && at(l.arrival.at) <= asOf)
    .sort((a, b) => a.arrivalIndex - b.arrivalIndex)
  const leg = arrived.at(-1)
  if (leg?.arrival == null) {
    return { kind: "unsent", unconfirmed: carriers.length > arrived.length }
  }
  const since = at(leg.arrival.at)
  if (since < runs.horizon) return { kind: "too-old" }
  // Come to the phone after the filing too: a phone's clock running behind
  // the run's can't make a run that went by early.
  const missed = leg.filed
    ? runs.made.find(
        (d) => d.created > since + HANDOVER_MS + RUN_MS && d.came > since
      )
    : undefined
  return missed
    ? { kind: "missed", leg, day: missed.day }
    : { kind: "on-way", leg }
}

/** Where share `id`'s file began, if the phone noted it (`carried`). */
function noted(state: JobsState, id: string): number | undefined {
  return Object.hasOwn(state.carried, id) ? state.carried[id] : undefined
}

const ledgers = new WeakMap<
  JobsState,
  Map<ShareKind, ReadonlyArray<ShareLeg>>
>()

/**
 * Every share of `kind`, in log order, with what each carried: from where
 * its file began (`carried`), or, for a share made before the phone noted
 * that, from the end of the last share that had arrived when it was made,
 * as `./files` built it then.
 */
function ledger(state: JobsState, kind: ShareKind): ReadonlyArray<ShareLeg> {
  const cached = ledgers.get(state)?.get(kind)
  if (cached) return cached
  const arrivals = new Map<string, { event: ArrivedEvent; index: number }>()
  state.log.forEach((e, index) => {
    if (e.type === "arrived" && !arrivals.has(e.shareId)) {
      arrivals.set(e.shareId, { event: e, index })
    }
  })
  const legs: Array<ShareLeg> = []
  state.log.forEach((e, index) => {
    if (e.type !== "shared" || e.kind !== kind) return
    const arrived = arrivals.get(e.id)
    const filed =
      arrived?.index === index + 1 &&
      Math.abs(at(arrived.event.at) - at(e.at)) <= FILED_WITHIN_MS
    const before = legs.filter(
      (l) => l.arrivalIndex >= 0 && l.arrivalIndex < index
    )
    legs.push({
      share: e,
      index,
      since: noted(state, e.id) ?? before.at(-1)?.through ?? 0,
      through: coveredBy(e, index),
      arrival: arrived?.event ?? null,
      arrivalIndex: arrived?.index ?? -1,
      filed,
    })
  })
  const byKind =
    ledgers.get(state) ?? new Map<ShareKind, ReadonlyArray<ShareLeg>>()
  byKind.set(kind, legs)
  ledgers.set(state, byKind)
  return legs
}

/** The first event of `kind` a run missed, by `asOf`, or null. */
function firstMissed(
  state: JobsState,
  kind: ShareKind,
  asOf: number
): number | null {
  const legs = ledger(state, kind)
  const runs = runsBy(state, asOf)
  // Only what a file filed with home carried can be missed.
  const filed = legs.filter((l) => l.filed)
  const from = Math.min(...filed.map((l) => l.since))
  const to = Math.max(...filed.map((l) => l.through))
  for (let i = Math.max(0, from); i < Math.min(to, state.log.length); i += 1) {
    const e = state.log.at(i)
    if (e === undefined || kindOf(e) !== kind) continue
    if (fateOf(legs, runs, i, asOf).kind === "missed") return i
  }
  return null
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
  const missed = firstMissed(state, kind, now.getTime())
  if (missed === null) return state
  const undone = new Set(
    ledger(state, kind)
      .filter((l) => l.through > missed)
      .map((l) => l.share.id)
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

const nowRuns = new WeakMap<JobsState, Runs>()

/** Every run the phone holds, once per record. */
function runsNow(state: JobsState): Runs {
  const found = nowRuns.get(state)
  if (found) return found
  const runs = runsBy(state, Infinity)
  nowRuns.set(state, runs)
  return runs
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
  const fate = fateOf(
    ledger(ctx.state, kind),
    runsNow(ctx.state),
    index,
    Infinity
  )
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
