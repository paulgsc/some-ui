/**
 * One wiring for every record this phone drains to its paired home (aph,
 * the Jobs record, Practice, voice notes; LA15,
 * docs/learner-data-authority.md). A lane declares what it is (`Lane`;
 * `./aph`, `./jobs`, `./practice`, `./voice`), and this module does the
 * rest, once for all of them: one runtime per lane per page load over the
 * link's `keep` (`./kept-runtime`), and the watch (`./kept-watch`) for as
 * long as `useLaneHome` is mounted (the app shell mounts every lane's,
 * `components/device-home-glyph.tsx`'s `HomeLanes`; aph's once its screens
 * hand its store in, `useHandLane`).
 */
import { useEffect, useSyncExternalStore } from "react"
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"

import { homeLink, paired, pairingOf, useHomeLink } from "./index"
import type { KeptState } from "./kept-model"
import type { Kept, KeptPorts } from "./kept-runtime"
import { createKept, laneExchange } from "./kept-runtime"
import type { KeptRecord } from "./kept-watch"
import { askKept, watchKept } from "./kept-watch"
import type { HomeLinkState } from "./model"
import type { LaneView } from "./words"
import { laneView, WORDS } from "./words"

export type LaneId = "practice" | "aph" | "jobs" | "voice"

/** What a lane's record holds of one kind, as the sheet names it. */
export type LaneKind =
  | "sessions"
  | "shelf"
  | "reflections"
  | "prompts"
  | "aph"
  | "jobs"
  | "voice"

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

/** How every run here reaches home: through the link, one at a time. */
const LINK_PORTS: Omit<KeptPorts, "exchange"> = {
  keep: (run) => homeLink().keep(run),
  paired,
  now: Date.now,
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
    return watchKept(record, sending)
  }, [lane])
  return useLaneRun(lane)
}

/**
 * How draining `lane` to home is going, read without a watch of its own:
 * for a screen that shows a lane the app shell drains (a wing's mark,
 * Settings).
 */
function useLaneRun(lane: Lane): KeptState {
  const { sending } = wire(lane)
  return useSyncExternalStore(sending.subscribe, sending.getSnapshot)
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
