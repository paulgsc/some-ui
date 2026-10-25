/**
 * One wiring for every record its person may keep on home (aph, LA9; the
 * Jobs record, LA10; Practice, LA11; voice notes, LA13;
 * docs/learner-data-authority.md). A lane declares what it is (`Lane`;
 * `./aph`, `./jobs`, `./practice`, `./voice`), and this module does the
 * rest, once for all of them: what its person chose (`./consent-runtime`),
 * one runtime per lane per page load over the link's `keep`
 * (`./kept-runtime`), and the watch (`./kept-watch`) for as long as the
 * lane's mark mounts `useLaneHome` (voice notes have no mark: the app shell
 * mounts theirs).
 */
import { useEffect, useSyncExternalStore } from "react"
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"
import { fnv1a, localStorageOrNull } from "@some-ui/core-utils"

import type { Scope, Shared } from "./consent-model"
import { everChosen, sharedNow, stoppedNow } from "./consent-model"
import { phoneConsent } from "./consent-runtime"
import { homeLink, useHomeLink } from "./index"
import type { KeptState } from "./kept-model"
import { INITIAL_KEPT } from "./kept-model"
import type { Kept, KeptPorts, Telling } from "./kept-runtime"
import { createKept, laneExchange, sayingBusy, toldFirst } from "./kept-runtime"
import type { KeptRecord } from "./kept-watch"
import { askKept, watchKept } from "./kept-watch"
import type { HomeLinkState } from "./model"
import { forgetTold, tellHome } from "./told"

export type LaneId = "practice" | "aph" | "jobs" | "voice"

/** What a lane's sheet counts, as its record says while its mark shows. */
export type LaneCounts = {
  /** Of each scope, how many this phone knows home holds; absent where it can't know. */
  readonly held: Readonly<Partial<Record<Scope, number>>>
  /** Of each scope, the items home didn't take, kept on this phone. */
  readonly refused: Readonly<Partial<Record<Scope, number>>>
  /** What home does not hold as it is now. */
  readonly waiting: number
  /**
   * The changes this phone holds while home holds the rest of its record
   * (aph kept on home); null for a record the phone keeps whole.
   */
  readonly away: number | null
  /** Waiting changes that clash with home's record, so not shown (aph). */
  readonly hidden: number
  /** Home's record has been read since the app opened (aph). */
  readonly pulled: boolean
  /** How much the opt-in would send, as its offer names it. */
  readonly offered: number
}

/** What a record declares to be kept on home. */
export type Lane = {
  readonly id: LaneId
  /** What its person keeps sending; chosen and stopped together. */
  readonly scopes: ReadonlyArray<Scope>
  /**
   * One exchange through `send`, under `pairing`, for what `shared` says is
   * kept as it runs. Throws what `send` throws.
   */
  readonly exchange: (
    send: HomeCall,
    at: { pairing: string; shared: () => ReadonlySet<Scope> }
  ) => Promise<HomeExchanged>
  /** Moves when this phone changes what the lane would send. */
  readonly revision: () => number
  readonly subscribe: (listener: () => void) => () => void
  /** A hook: the sheet's counts, read while the lane's mark shows. */
  readonly useCounts: () => LaneCounts
  /** Its record's own switch says kept on home (`enterEarlier`). */
  readonly keptBefore?: () => boolean
  /**
   * The record's own part of the opt-in (aph moves its record). Best effort:
   * the lane's exchange makes it again until it holds.
   */
  readonly switchOn?: () => boolean
  /**
   * Once stopped, one read of home that keeps its record on this phone
   * again (aph), if `stopped` still holds once read. Throws what `send`
   * throws.
   */
  readonly bringBack?: (
    send: HomeCall,
    stopped: () => boolean
  ) => Promise<HomeExchanged>
}

/** The id of the pairing this phone holds, or `null`. */
export function pairingOf(
  state: HomeLinkState = homeLink().getSnapshot()
): string | null {
  return state.link.kind === "paired" ? state.link.id : null
}

/** Of a map by scope, `lane`'s scopes alone. */
function ofLane<T>(
  lane: Pick<Lane, "scopes">,
  byScope: ReadonlyMap<Scope, T>
): ReadonlyMap<Scope, T> {
  return new Map([...byScope].filter(([scope]) => lane.scopes.includes(scope)))
}

/** What `lane`'s person keeps sending to the paired home, as the log says. */
function sharedBy(
  lane: Pick<Lane, "scopes">,
  log = phoneConsent().getSnapshot(),
  pairing = pairingOf()
): Shared {
  return ofLane(lane, sharedNow(log, pairing))
}

/** Whether `lane`'s person keeps sending it to the paired home, now. */
export function keptNow(lane: Pick<Lane, "scopes">): boolean {
  return sharedBy(lane).size > 0
}

type Wired = {
  readonly record: KeptRecord
  readonly sending: Kept
  /** Bringing the record back once stopped; null for a lane that keeps it. */
  readonly back: Kept | null
}

const wired = new Map<LaneId, Wired>()

/** How every run here reaches home: through the link, one at a time. */
const LINK_PORTS: Omit<KeptPorts, "exchange"> = {
  keep: (run) => homeLink().keep(run),
  paired: (): boolean => pairingOf() !== null,
  now: Date.now,
}

/** One runtime per lane per page load, over the first `lane` handed in. */
function wire(lane: Lane): Wired {
  const found = wired.get(lane.id)
  if (found) return found
  const shared = (): ReadonlySet<Scope> => new Set(sharedBy(lane).keys())
  const { bringBack } = lane
  const made: Wired = {
    record: {
      kept: () => shared().size > 0,
      revision: () =>
        fnv1a(`${phoneConsent().getSnapshot().length}|${lane.revision()}`),
      subscribe(listener): () => void {
        const unsubscribeConsent = phoneConsent().subscribe(listener)
        const unsubscribeLane = lane.subscribe(listener)
        return () => {
          unsubscribeConsent()
          unsubscribeLane()
        }
      },
    },
    sending: createKept({
      ...LINK_PORTS,
      exchange: laneExchange(lane, () => pairingOf(), shared, TELLING),
    }),
    back:
      bringBack === undefined
        ? null
        : createKept({
            ...LINK_PORTS,
            exchange: sayingBusy((send) => {
              const stopped = (): boolean => shared().size === 0
              const pairing = pairingOf()
              if (!stopped() || pairing === null) {
                return Promise.resolve({ kind: "synced" })
              }
              // The stop first, though the read goes on if home can't hear it:
              // a way back only reads.
              return toldFirst(
                TELLING,
                pairing,
                (through) => bringBack(through, stopped),
                "tried"
              )(send)
            }),
          }),
  }
  wired.set(lane.id, made)
  return made
}

/**
 * A choice its record's own switch made before the consent log, entered
 * there once, as found (`said: null`), under a pairing an earlier build made
 * (`earlier`): never under one this build made.
 */
function enterEarlier(lane: Lane): void {
  const { link } = homeLink().getSnapshot()
  if (link.kind !== "paired" || !link.earlier) return
  if (lane.keptBefore?.() !== true) return
  const pairing = link.id
  const log = phoneConsent().getSnapshot()
  if (lane.scopes.some((scope) => everChosen(log, scope))) return
  phoneConsent().choose({
    kind: "kept",
    pairing,
    scopes: lane.scopes,
    said: null,
  })
}

/** Tells home every choice under `pairing` it has not heard (`./told`). */
function tellChoices(send: HomeCall, pairing: string): Promise<HomeExchanged> {
  return tellHome(
    send,
    pairing,
    phoneConsent().getSnapshot(),
    localStorageOrNull()
  )
}

const TELLING: Telling = {
  tell: tellChoices,
  unheard: (pairing) => forgetTold(localStorageOrNull(), pairing),
}

let teller: Kept | null = null

/** One run that only tells home the pairing's choices, for a stop. */
function telling(): Kept {
  teller ??= createKept({
    ...LINK_PORTS,
    exchange: sayingBusy((send) => {
      const pairing = pairingOf()
      return pairing === null
        ? Promise.resolve({ kind: "synced" })
        : tellChoices(send, pairing)
    }),
  })
  return teller
}

/**
 * How sending `lane` home is going; while mounted, its watch, and its way
 * back, and the telling of a stop, asked for again once the link frees,
 * when the link turned it away.
 */
export function useLaneHome(lane: Lane): KeptState {
  const { sending } = wire(lane)
  useEffect(() => {
    const { record, sending, back } = wire(lane)
    const onLink = (): void => {
      enterEarlier(lane)
      const idle = homeLink().getSnapshot().activity.kind === "idle"
      if (idle && back?.getSnapshot().last?.kind === "busy") back.want()
      if (idle && teller?.getSnapshot().last?.kind === "busy") teller.want()
    }
    onLink()
    const unsubscribeLink = homeLink().subscribe(onLink)
    const unwatch = watchKept(record, sending)
    return (): void => {
      unsubscribeLink()
      unwatch()
    }
  }, [lane])
  return useSyncExternalStore(sending.subscribe, sending.getSnapshot)
}

const NO_BACK: Kept = {
  getSnapshot: () => INITIAL_KEPT,
  subscribe: () => () => undefined,
  want: () => undefined,
}

/** How bringing `lane`'s record back is going (aph); idle for the others. */
export function useLaneBack(lane: Lane): KeptState {
  const back = wire(lane).back ?? NO_BACK
  return useSyncExternalStore(back.subscribe, back.getSnapshot)
}

/**
 * What `lane`'s person keeps sending, and what they stopped, now. Its
 * scopes are all it reads, so a screen that cannot hold a lane (aph's, in
 * Settings) passes those alone.
 */
export function useLaneChoices(lane: Pick<Lane, "scopes">): {
  shared: Shared
  stopped: ReadonlyMap<Scope, number>
} {
  const consent = phoneConsent()
  const log = useSyncExternalStore(consent.subscribe, consent.getSnapshot)
  const pairing = pairingOf(useHomeLink())
  return {
    shared: sharedBy(lane, log, pairing),
    stopped: ofLane(lane, stoppedNow(log, pairing)),
  }
}

/** "Send now": asks for a run, as any moment the watch names would. */
export function askLane(lane: Lane): void {
  const { record, sending } = wire(lane)
  askKept(record, sending, document)
}

/**
 * The opt-in's second press: `lane` is kept on home under `pairing` from
 * now on, with `said` as the words agreed to. False when the phone would
 * not keep the choice.
 */
export function keepOnHome(lane: Lane, pairing: string, said: string): boolean {
  const kept = phoneConsent().choose({
    kind: "kept",
    pairing,
    scopes: lane.scopes,
    said,
  })
  if (kept) lane.switchOn?.()
  return kept
}

/**
 * "Stop sending"'s second press: nothing new goes to the paired home, which
 * keeps what it has; a lane whose phone let its record go (aph) then asks
 * home for it back. False when the phone would not keep the choice.
 */
export function stopOnHome(lane: Lane): boolean {
  const pairing = pairingOf()
  if (pairing === null) return false
  const stopped = phoneConsent().choose({
    kind: "stopped",
    pairing,
    scopes: lane.scopes,
  })
  // Home is told the stop: by the way back where the lane has one, which
  // tells it first, and otherwise on its own, since no run of a stopped
  // lane will.
  if (stopped) (wire(lane).back ?? telling()).want()
  return stopped
}

/** "Bring it back": asks home for the record again, once stopped. */
export function bringLaneBack(lane: Lane): void {
  wire(lane).back?.want()
}

const handed = new Map<LaneId, Lane>()
const handedListeners = new Set<() => void>()
const handedChanged = (): void => {
  for (const listener of handedListeners) listener()
}

/** Hands `lane` to the header's mark while mounted (aph's, `./aph`). */
export function useHandLane(lane: Lane): void {
  useEffect(() => {
    handed.set(lane.id, lane)
    handedChanged()
    return (): void => {
      if (handed.get(lane.id) === lane) handed.delete(lane.id)
      handedChanged()
    }
  }, [lane])
}

/** The lane `id`'s screens handed in, while they are mounted. */
export function useHandedLane(id: LaneId): Lane | null {
  return useSyncExternalStore(
    (listener) => {
      handedListeners.add(listener)
      return () => {
        handedListeners.delete(listener)
      }
    },
    () => handed.get(id) ?? null
  )
}
