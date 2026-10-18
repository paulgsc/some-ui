/**
 * The runtime (BC5, #1438) — what wires Sensor → Core → Actuator and owns
 * the seams between them.
 *
 * Everything here is glue, and deliberately thin:
 *
 *   - tokens from the Sensor and the shell's lifecycle go through one
 *     `dispatch()`, which folds the event through `reduce()`, binds the
 *     Actuator's targets to each `render` / `unmount` (the Sensor knows
 *     which elements carry a key; Core cannot), and hands the bound actions
 *     to the Actuator;
 *   - facts go to the flight recorder;
 *   - the debug layer reads Core's state and the Sensor's census.
 *
 * Lifecycle (`controller.ts`'s C1–C4): `start()` is idempotent, `stop()`
 * is total, navigation is a `nav` token the Sensor emits after a debounce
 * and Core answers by forgetting every card (R3).
 */

import type { Actuator, BoundAction } from "@censor/lib/content/actuator/index"
import { createActuator } from "@censor/lib/content/actuator/index"
import type { Action, CoreFact } from "@censor/lib/content/core/actions"
import type { CoreEvent } from "@censor/lib/content/core/events"
import { reduce } from "@censor/lib/content/core/reduce"
import { admits, initialState } from "@censor/lib/content/core/state"
import type { CoreState } from "@censor/lib/content/core/state"
import {
  notifyMutation,
  notifyNavigation,
  publish,
  registerDebugSource,
} from "@censor/lib/content/debug"
import { YOUTUBE_LAYOUT } from "@censor/lib/content/layout/generated/youtube-layout"
import type { LayoutTable } from "@censor/lib/content/layout/schema"
import { surfaceOf } from "@censor/lib/content/layout/surface"
import { createSensor } from "@censor/lib/content/sensor/sensor"
import type { EntryDebugInfo } from "@censor/types/debug"
import type { SessionId } from "@some-extension/common"
import { mkSession } from "@some-extension/common"

import { recordFact } from "./facts"
import { createHealth } from "./health"
import type { Health } from "./health"

export type RuntimePorts = {
  readonly doc: Document
  readonly win: Window
  readonly table?: LayoutTable
  readonly clock?: () => number
  readonly mintSession?: () => SessionId
  readonly onFact?: (fact: CoreFact) => void
}

export type Runtime = {
  /** Start a session: subscribe, scan, render. Idempotent. */
  start(): void
  /** Tear everything down. Total. */
  stop(): void
  /** Observe every card on the page now. */
  scan(): void
  /** The owner's boundary, applied now if running and at every later start. */
  setBoundary(days: number): void
  readonly state: CoreState
  readonly running: boolean
}

export function createRuntime(ports: RuntimePorts): Runtime {
  const clock = ports.clock ?? ((): number => Date.now())
  const mintSession = ports.mintSession ?? mkSession
  const table = ports.table ?? YOUTUBE_LAYOUT
  const onFact = ports.onFact ?? recordFact

  let state: CoreState = initialState(mintSession())
  let boundaryDays = state.boundaryDays
  let actuator: Actuator | null = null
  let health: Health | null = null
  let firstScan: number | null = null

  const sensorInstance = createSensor({
    doc: ports.doc,
    win: ports.win,
    table,
    surface: () => surfaceOf(ports.doc.location.pathname),
    clock,
    mintSession,
    emit: (token) => dispatch(token),
    admits: (videoId) => admits(state, videoId),
    onFact: (fact) => {
      onFact(fact)
      if (fact.kind === "mutation.batch") {
        notifyMutation()
        health?.tick()
      }
      // The queue is the Sensor's; a fact is the only signal it changed, and
      // the debug snapshot the e2e suite polls has to show a drained queue
      // when it drains, not on the next card event.
      publish()
    },
  })

  function bind(actions: ReadonlyArray<Action>): Array<BoundAction> {
    const bound: Array<BoundAction> = []
    for (const action of actions) {
      if (action.kind === "record") {
        if (action.fact.kind === "navigation") notifyNavigation()
        onFact(action.fact)
      } else if (action.kind === "watch") {
        const el = sensorInstance.description()
        bound.push({
          action,
          targets: el === null ? [] : [{ el, role: "anchor" }],
        })
      } else {
        bound.push({ action, targets: sensorInstance.custodyOf(action.key) })
      }
    }
    return bound
  }

  function dispatch(event: CoreEvent): void {
    const step = reduce(state, event)
    state = step.state
    const bound = bind(step.actions)
    if (bound.length > 0) actuator?.realize(bound)
    // A navigation is a new session (C2): occlusion ages from the page before
    // it must not count against the page after it.
    if (event.kind === "nav") health?.sessionStarted()
    publish()
  }

  registerDebugSource({
    get phase() {
      return state.phase
    },
    get size() {
      return state.cards.size
    },
    get unresolvedSize() {
      return sensorInstance.queued
    },
    get sessionOrdinal() {
      return state.session
    },
    entryInfos(): ReadonlyArray<EntryDebugInfo> {
      const out: Array<EntryDebugInfo> = []
      for (const card of state.cards.values()) {
        const custody = sensorInstance.custodyOf(card.key)
        out.push({
          videoId: card.observation.videoId,
          channelId: card.observation.channelId ?? "",
          viewKind: card.view.kind,
          isConnected: custody.some((t) => t.el.isConnected),
        })
      }
      return out
    },
  })

  return {
    start(): void {
      if (state.phase === "running") return
      actuator = createActuator(ports.doc, {
        onFace: (videoId) => dispatch({ kind: "face", videoId, t: clock() }),
      })
      health = createHealth({
        clock,
        state: () => state,
        census: () => sensorInstance.census(),
      })
      dispatch({
        kind: "start",
        session: mintSession(),
        boundaryDays,
        t: clock(),
      })
      sensorInstance.start()
      health.sessionStarted()
      if (typeof ports.win.requestAnimationFrame === "function") {
        // Lifetime: cancelled by stop().
        firstScan = ports.win.requestAnimationFrame(() => {
          firstScan = null
          sensorInstance.scan()
        })
      } else {
        sensorInstance.scan()
      }
    },

    stop(): void {
      if (state.phase !== "running") return
      if (firstScan !== null) ports.win.cancelAnimationFrame(firstScan)
      firstScan = null
      sensorInstance.stop()
      dispatch({ kind: "stop", t: clock() })
      health?.stop()
      health = null
      actuator?.dispose()
      actuator = null
    },

    scan(): void {
      sensorInstance.scan()
    },

    setBoundary(days: number): void {
      boundaryDays = days
      dispatch({ kind: "boundary", days, t: clock() })
    },

    get state(): CoreState {
      return state
    },

    get running(): boolean {
      return state.phase === "running"
    },
  }
}
