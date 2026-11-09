/**
 * One wiring for every record this phone drains to its paired home (aph,
 * the Jobs record, Practice, voice notes, Rust Rounds' rounds; LA15,
 * docs/learner-data-authority.md). A lane declares what it is (`Lane`;
 * `./aph`, `./jobs`, `./practice`, `./voice`, `./rust-rounds`), and this
 * module does the rest, once for all of them: one runtime per lane per page
 * load over the
 * link's `keep` (`./kept-runtime`), and the watch (`./kept-watch`) for as
 * long as `useLaneHome` is mounted (the app shell mounts every lane's,
 * `components/device-home-glyph.tsx`'s `HomeLanes`; aph's once its screens
 * hand its store in, `useHandLane`), and a pull's ask of every lane so
 * watched (`useHomePull`, `./pull`).
 */
import { useEffect, useSyncExternalStore } from "react"
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"

import { screenRefreshers } from "@/lib/pull-refresh/refreshers"

import { homeLink, LINK_CLOCK, paired, pairingOf, useHomeLink } from "./index"
import type { KeptRun, KeptState } from "./kept-model"
import type { Kept, KeptPorts } from "./kept-runtime"
import { createKept, laneExchange } from "./kept-runtime"
import type { KeptRecord } from "./kept-watch"
import { askKept, watchKept } from "./kept-watch"
import type { HomeLinkState } from "./model"
import { homeBusy } from "./model"
import type { HomeRefresher } from "./pull"
import { homeRefresher } from "./pull"
import type { LaneView } from "./words"
import { laneView, WORDS } from "./words"

export type LaneId =
  | "practice"
  | "aph"
  | "jobs"
  | "voice"
  | "rust-rounds"
  | "app-events"

/** What a lane's record holds of one kind, as the sheet names it. */
export type LaneKind =
  | "sessions"
  | "shelf"
  | "reflections"
  | "prompts"
  | "aph"
  | "jobs"
  | "voice"
  | "ideas"
  | "episodeNotes"
  | "rounds"
  | "endings"

/** What a lane's sheet counts, as its record says. */
export type LaneCounts = {
  /** Of each kind, how many this phone knows home holds; absent where it can't know. */
  readonly held: Readonly<Partial<Record<LaneKind, number>>>
  /** Of each kind, the items home didn't take, kept on this phone. */
  readonly refused: Readonly<Partial<Record<LaneKind, number>>>
  /** What home does not hold as it is now. */
  readonly waiting: number
  /** Waiting changes that clash with home's record, so not shown (aph). */
  readonly hidden: number
  /** Home's record has been read since the app opened (aph). */
  readonly pulled: boolean
}

/** What a record declares to be drained to home. */
export type Lane = {
  readonly id: LaneId
  /** One exchange through `send`, under `pairing`. Throws what `send` throws. */
  readonly exchange: (
    send: HomeCall,
    at: { pairing: string }
  ) => Promise<HomeExchanged>
  /** Moves when this phone changes what the lane would send. */
  readonly revision: () => number
  readonly subscribe: (listener: () => void) => () => void
  /** A hook: the sheet's counts, read while the lane's mark shows. */
  readonly useCounts: () => LaneCounts
}

type Wired = {
  readonly record: KeptRecord
  readonly sending: Kept
}

const wired = new Map<LaneId, Wired>()

/** The runtimes of the lanes `useLaneHome` watches now: what a pull asks. */
const watched = new Set<Kept>()

/** Whether home is still to be left alone, on the link's clock (AD3). */
export function busyNow(): boolean {
  return homeBusy(homeLink().getSnapshot(), LINK_CLOCK.now())
}

/** How every run here reaches home: through the link's drain, one at a time. */
const LINK_PORTS: Omit<KeptPorts, "exchange"> = {
  keep: (run) => homeLink().drain(run),
  paired,
  homeBusy: busyNow,
  now: LINK_CLOCK.now,
}

/** One runtime per lane per page load, over the first `lane` handed in. */
function wire(lane: Lane): Wired {
  const found = wired.get(lane.id)
  if (found) return found
  const made: Wired = {
    record: { revision: lane.revision, subscribe: lane.subscribe },
    sending: createKept({
      ...LINK_PORTS,
      exchange: laneExchange(lane, () => pairingOf()),
    }),
  }
  wired.set(lane.id, made)
  return made
}

/**
 * How draining `lane` to home is going, and, while mounted, its watch: the
 * runs asked for at the moments LA15 names.
 */
export function useLaneHome(lane: Lane): KeptState {
  useEffect(() => {
    const { record, sending } = wire(lane)
    const unwatch = watchKept(record, sending)
    watched.add(sending)
    return (): void => {
      watched.delete(sending)
      unwatch()
    }
  }, [lane])
  return useLaneRun(lane)
}

let homePull: HomeRefresher | null = null

/** The one pull of home, made on first use (`document` is read then). */
function homePullOf(): HomeRefresher {
  homePull ??= homeRefresher({ watched: () => watched, doc: document })
  return homePull
}

/**
 * While mounted (the app shell's `HomeLanes`), a pull asks every watched
 * lane for a run and hears how each ended (`./pull`, PULL3; LA15).
 */
export function useHomePull(): void {
  useEffect(() => screenRefreshers.register(homePullOf()), [])
}

/**
 * How `lane`'s run in the pull under way ended (`./pull`'s `ended`), for a
 * screen that names that lane in its own words (Jobs, PULL2).
 */
export function pulledLane(lane: Lane): Promise<KeptRun | null> {
  return homePullOf().ended(wire(lane).sending)
}

/**
 * How draining `lane` to home is going, read outside React and without a
 * watch of its own: for a screen's runtime that says where what it keeps
 * goes (a new idea's, ST26).
 */
export function laneRun(lane: Lane): Pick<Kept, "getSnapshot" | "subscribe"> {
  const { sending } = wire(lane)
  return { getSnapshot: sending.getSnapshot, subscribe: sending.subscribe }
}

/** `laneRun` in React: for a screen that shows a lane the app shell drains (a wing's mark, Settings). */
function useLaneRun(lane: Lane): KeptState {
  const run = laneRun(lane)
  return useSyncExternalStore(run.subscribe, run.getSnapshot)
}

/**
 * Whether Send now is offered: paired, not sending, and something waits or
 * the last run did not get everything to home (no answer, home busy, its
 * shelf full, something not taken), which is worth trying again even when
 * nothing counted waits: what did not go is not always what a lane counts.
 */
function offersSendNow(
  run: KeptState,
  counts: LaneCounts,
  isPaired: boolean
): boolean {
  if (!isPaired || run.running) return false
  return (
    counts.waiting > 0 ||
    run.last?.kind === "unreachable" ||
    run.last?.kind === "failed"
  )
}

/** A lane as its mark and Settings show it. */
export type LaneReading = {
  readonly run: KeptState
  /** The phone is paired with home, so the lane drains. */
  readonly paired: boolean
  readonly view: LaneView
  readonly sendNow: boolean
}

/** How lane `id` reads from its `counts`, its `run` and the link's `state`. */
export function laneReading(
  id: LaneId,
  counts: LaneCounts,
  run: KeptState,
  state: HomeLinkState
): LaneReading {
  const isPaired = pairingOf(state) !== null
  return {
    run,
    paired: isPaired,
    view: laneView(WORDS[id], {
      ...counts,
      known: state.link.kind !== "reading",
      paired: isPaired,
      run,
    }),
    sendNow: offersSendNow(run, counts, isPaired),
  }
}

/** `lane` as its mark and Settings show it, read without a watch of its own. */
export function useLaneView(lane: Lane): LaneReading {
  return laneReading(lane.id, lane.useCounts(), useLaneRun(lane), useHomeLink())
}

/** "Send now": asks for a run, as any moment the watch names would. */
export function askLane(lane: Lane): void {
  askKept(wire(lane).sending, document)
}

const handed = new Map<LaneId, Lane>()
const handedListeners = new Set<() => void>()
const handedChanged = (): void => {
  for (const listener of handedListeners) listener()
}

/** Hands `lane` to the app shell and the header's mark while mounted (aph's, `./aph`). */
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
