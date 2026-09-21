/**
 * The runtime (BC5, #1438) — what wires Sensor → Core → Actuator and owns
 * the seams between them.
 *
 * Everything here is glue, and deliberately thin:
 *
 *   - tokens from the Sensor and inputs from the Actuator, the keybindings
 *     and the background go through one `dispatch()`, which folds the event
 *     through `reduce()`, binds the Actuator's targets to each `render` /
 *     `unmount` (the Sensor knows which elements carry a key; Core cannot),
 *     and hands the bound actions to the Actuator;
 *   - a gesture re-observes its card first, so Core decides on the evidence
 *     the page shows *now* (parity with the former per-card entry extracting at click
 *     time) rather than at first sight;
 *   - facts go to the flight recorder; the bulk-advance fact is completed
 *     with the DOM census only the Sensor can take (#1424);
 *   - the debug layer reads Core's state and the Sensor's census.
 *
 * Lifecycle (Controller's C1–C4, restated): `start()` is idempotent, `stop()`
 * is total, navigation is a `nav` token the Sensor emits after a debounce
 * and Core answers by forgetting every card (R3).
 */

import type { Actuator, BoundAction } from "@censor/lib/content/actuator/index"
import { createActuator } from "@censor/lib/content/actuator/index"
import type { Action, CoreFact } from "@censor/lib/content/core/actions"
import type { CoreEvent, Input } from "@censor/lib/content/core/events"
import { reduce } from "@censor/lib/content/core/reduce"
import type { CoreState } from "@censor/lib/content/core/state"
import { initialState } from "@censor/lib/content/core/state"
import {
  notifyMutation,
  notifyNavigation,
  publish,
  registerDebugSource,
} from "@censor/lib/content/debug"
import { YOUTUBE_LAYOUT } from "@censor/lib/content/layout/generated/youtube-layout"
import type { LayoutTable } from "@censor/lib/content/layout/schema"
import { surfaceOf } from "@censor/lib/content/layout/surface"
import { observability } from "@censor/lib/content/observability"
import { createSensor } from "@censor/lib/content/sensor/sensor"
import { ext } from "@censor/platform/content"
import type { EntryDebugInfo } from "@censor/types/debug"
import type { BgRequest } from "@censor/types/messages"
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
  readonly sendMessage?: (msg: BgRequest) => Promise<unknown>
  readonly confirmWhitelist?: () => boolean
  readonly onFact?: (fact: CoreFact) => void
}

export type Runtime = {
  /** Start a session: subscribe, scan, render. Idempotent. */
  start(): void
  /** Tear everything down. Total. */
  stop(): void
  /** Feed an input from outside the pipeline (a broadcast, a keybinding). */
  dispatch(event: CoreEvent): void
  /** Observe every card on the page now. */
  scan(): void
  readonly state: CoreState
  readonly running: boolean
}

export function createRuntime(ports: RuntimePorts): Runtime {
  const clock = ports.clock ?? ((): number => Date.now())
  const mintSession = ports.mintSession ?? mkSession
  const table = ports.table ?? YOUTUBE_LAYOUT
  const onFact = ports.onFact ?? recordFact

  let state: CoreState = initialState(mintSession())
  let actuator: Actuator | null = null
  let health: Health | null = null

  const sensorInstance = createSensor({
    doc: ports.doc,
    win: ports.win,
    table,
    surface: () => surfaceOf(ports.doc.location.pathname),
    clock,
    mintSession,
    emit: (token) => dispatch(token),
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

  function inbox(input: Input): void {
    // Decide on the evidence the page shows now (see the module header).
    if (input.kind === "gesture") sensorInstance.refresh(input.key)
    dispatch(input)
  }

  function bind(actions: ReadonlyArray<Action>): Array<BoundAction> {
    const bound: Array<BoundAction> = []
    for (const action of actions) {
      if (action.kind === "render" || action.kind === "unmount") {
        bound.push({ action, targets: sensorInstance.custodyOf(action.key) })
      } else if (action.kind === "record") {
        onFact(complete(action.fact))
      } else {
        bound.push({ action })
      }
    }
    return bound
  }

  /** The bulk-advance fact is Core's counts; the DOM census is the Sensor's. */
  function complete(fact: CoreFact): CoreFact {
    if (fact.kind === "navigation") notifyNavigation()
    if (fact.kind !== "bulk.advance") return fact
    const census = sensorInstance.census()
    const obs = observability()
    if (obs !== null) {
      const queued = new Set(census.unresolved.map((q) => q.el))
      let unresolved = 0
      for (const el of census.occluded) if (queued.has(el)) unresolved += 1
      let detached = 0
      for (const card of state.cards.values()) {
        const custody = sensorInstance.custodyOf(card.key)
        if (custody.length > 0 && custody.every((t) => !t.el.isConnected))
          detached += 1
      }
      obs.bulkAdvance({
        advanced: fact.advanced,
        alreadyPast: fact.alreadyPast,
        detached,
        unresolved,
        // A card is rendered the instant it is observed; nothing is ever
        // "mid-mount" under the occluder any more.
        promoting: 0,
        occludedUntracked: census.occludedUntracked,
        channelPending: fact.channelPending,
      })
    }
    return fact
  }

  function dispatch(event: CoreEvent): void {
    const step = reduce(state, event)
    state = step.state
    const bound = bind(step.actions)
    if (bound.length > 0) actuator?.realize(bound)
    health?.stateChanged()
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
      return sensorInstance.census().unresolved.length
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
          channelId:
            card.channel.kind === "unknown" ? "" : card.channel.channelId,
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
      actuator = createActuator({
        doc: ports.doc,
        inbox,
        clock,
        onFact,
        sendMessage:
          ports.sendMessage ??
          ((msg): Promise<unknown> => ext.runtime.sendMessage(msg)),
        titleHook: () => ports.win.__boyoTransformTitle,
        confirmWhitelist:
          ports.confirmWhitelist ??
          ((): boolean =>
            ports.win.confirm(
              "Add this channel to whitelist?\n(Always show content from this channel)"
            )),
      })
      health = createHealth({
        clock,
        state: () => state,
        census: () => sensorInstance.census(),
      })
      dispatch({ kind: "start", session: mintSession(), t: clock() })
      sensorInstance.start()
      health.sessionStarted()
      if (typeof ports.win.requestAnimationFrame === "function") {
        ports.win.requestAnimationFrame(() => sensorInstance.scan())
      } else {
        sensorInstance.scan()
      }
    },

    stop(): void {
      if (state.phase !== "running") return
      sensorInstance.stop()
      dispatch({ kind: "stop", t: clock() })
      health?.stop()
      health = null
      actuator?.dispose()
      actuator = null
    },

    dispatch,

    scan(): void {
      sensorInstance.scan()
    },

    get state(): CoreState {
      return state
    },

    get running(): boolean {
      return state.phase === "running"
    },
  }
}
