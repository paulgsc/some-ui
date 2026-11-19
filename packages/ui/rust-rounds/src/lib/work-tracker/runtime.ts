/**
 * The tracker's runtime (RR26, paulgsc/some-ui#3250): `stepTracker` over
 * the clock, this phone's record (`./record`) and what home last said is
 * open. A screen reads its snapshot and sends it the owner's taps; the
 * runtime alone decides what is kept and when (CLAUDE.md, "React is not the
 * coordinator").
 *
 * - **Kept here first.** A start is kept on this phone before the span runs,
 *   and a close before the answer counts; one the phone can't keep is not
 *   started, or asked again, and the snapshot says so (`notice`). Each
 *   event kept asks the lane to send (`ports.send`).
 * - **Home, once it is the authority.** Until home has said what is open,
 *   the phone's own record says it (`openOnPhone`): a span started with no
 *   home in reach keeps running after a reload. What home says (`homeOpen`)
 *   is fed in whenever it changes; the lane leaves it undefined while a
 *   start this phone kept hasn't reached home.
 * - **It stops itself.** While a span runs, a wake-up at its cap and the app
 *   coming to the front each tell the step the time (`seen`), so a span past
 *   two hours asks when the owner is back.
 */
import type {
  Answer,
  ClosedSpan,
  OpenSpan,
  SpanWhere,
  TrackerEvent,
  TrackerState,
} from "@rust-rounds/lib/work-tracker"
import { CAP_MS, stepTracker } from "@rust-rounds/lib/work-tracker"
import type { HomeSpan } from "@rust-rounds/lib/work-tracker/home"
import type { SpanEvent } from "@rust-rounds/lib/work-tracker/record"
import {
  closeOf,
  openOnPhone,
  startOf,
} from "@rust-rounds/lib/work-tracker/record"
import type { BundleRecords } from "@some-ui/voice-capture"

/** How often a running span's clock is read again for the screen. */
const TICK_MS = 30_000

export type TrackerPorts = {
  /** This phone's record of spans, which only grows. */
  readonly record: BundleRecords<SpanEvent>
  /**
   * The span home holds open, once nothing this phone kept waits to reach
   * it; undefined until then.
   */
  readonly homeOpen: () => OpenSpan | null | undefined
  /** Calls `listener` whenever `homeOpen` may have changed. Returns the stop. */
  readonly onHome: (listener: () => void) => () => void
  /** Asks the lane to send what was kept. */
  readonly send: () => void
  /** Milliseconds since the epoch. */
  readonly now: () => number
  readonly newId: () => string
  /** This device, as the owner names it. */
  readonly device: string
  readonly onVisibility: (listener: (hidden: boolean) => void) => () => void
  /** Runs `run` once after `ms`. Returns the cancel. */
  readonly after: (ms: number, run: () => void) => () => void
}

/** What the screen last needs to say, over the screen, once. */
type TrackerNotice =
  | { readonly kind: "counted"; readonly closed: ClosedSpan }
  /** The phone couldn't keep the start: nothing runs. */
  | { readonly kind: "not-started" }

type TrackerSnapshot = {
  readonly state: TrackerState
  /** The clock, read at least every `TICK_MS` while a span runs. */
  readonly now: number
  readonly notice: TrackerNotice | null
}

export type WorkTracker = {
  readonly getSnapshot: () => TrackerSnapshot
  readonly subscribe: (listener: () => void) => () => void
  /** Start a span counted toward `where`. */
  readonly start: (where: SpanWhere) => void
  /** The owner is back. */
  readonly back: () => void
  readonly answer: (answer: Answer) => void
  readonly dismiss: () => void
  /** The screen is showing. Returns the detach. */
  readonly attach: () => () => void
}

export function createWorkTracker(ports: TrackerPorts): WorkTracker {
  const listeners = new Set<() => void>()
  let snapshot: TrackerSnapshot = {
    state: { kind: "unknown" },
    now: ports.now(),
    notice: null,
  }
  let cancelCap: (() => void) | null = null
  let cancelTick: (() => void) | null = null
  let attached = 0

  const publish = (next: Partial<TrackerSnapshot>): void => {
    snapshot = { ...snapshot, ...next }
    for (const listener of listeners) listener()
  }

  /** Arms the cap and the tick for a running span; disarms otherwise. */
  const arm = (): void => {
    cancelCap?.()
    cancelTick?.()
    cancelCap = null
    cancelTick = null
    const { state } = snapshot
    if (state.kind !== "running" || attached === 0) return
    const left = state.span.startedAt + CAP_MS - ports.now()
    cancelCap = ports.after(Math.max(0, left), () => {
      dispatch({ type: "seen", at: ports.now() })
    })
    const tick = (): void => {
      cancelTick = ports.after(TICK_MS, () => {
        publish({ now: ports.now() })
        tick()
      })
    }
    tick()
  }

  /** Steps, keeping each effect on this phone before it counts. */
  function dispatch(event: TrackerEvent): void {
    const { state, effects } = stepTracker(snapshot.state, event)
    let notice = snapshot.notice
    let follow: TrackerEvent | null = null
    for (const effect of effects) {
      if (effect.type === "close") {
        const kept = ports.record.keep((events) => [
          ...events,
          closeOf(effect.closed),
        ])
        follow = { type: "kept", kept: kept !== null }
        if (kept !== null) ports.send()
      } else if (effect.type === "counted") {
        notice = { kind: "counted", closed: effect.closed }
      }
    }
    const before = snapshot.state
    publish({ state, now: ports.now(), notice })
    if (follow !== null) dispatch(follow)
    else if (before !== state) arm()
  }

  /** What is open: home's word once it has one, else this phone's record. */
  const hear = (): void => {
    const home = ports.homeOpen()
    const open =
      home === undefined ? openOnPhone(ports.record.list() ?? []) : home
    dispatch({ type: "homeSays", open, at: ports.now() })
  }
  hear()

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener): (() => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    start: (where): void => {
      if (snapshot.state.kind !== "idle") return
      const span: OpenSpan = {
        id: ports.newId(),
        where,
        startedAt: ports.now(),
        device: ports.device,
      }
      const kept = ports.record.keep((events) => [...events, startOf(span)])
      if (kept === null) {
        publish({ notice: { kind: "not-started" } })
        return
      }
      dispatch({ type: "start", span })
      ports.send()
    },
    back: (): void => {
      dispatch({ type: "back", at: ports.now() })
    },
    answer: (answer): void => {
      dispatch({ type: "answer", answer })
    },
    dismiss: (): void => {
      publish({ notice: null })
    },
    attach: (): (() => void) => {
      attached += 1
      const home = ports.onHome(hear)
      const visibility = ports.onVisibility((hidden) => {
        if (!hidden) dispatch({ type: "seen", at: ports.now() })
      })
      dispatch({ type: "seen", at: ports.now() })
      arm()
      return () => {
        attached -= 1
        home()
        visibility()
        arm()
      }
    },
  }
}

/** What is known of a week's spans: this phone's record and home's last word. */
export type WeekSpansKnown = {
  readonly phone: ReadonlyArray<SpanEvent>
  readonly home: ReadonlyArray<HomeSpan>
  /** Whether home refused the event for good, by `<id>/<kind>`. */
  readonly refused: (key: string) => boolean
}

/** The tracker and what the week's time is drawn from. */
export type WorkPorts = {
  readonly tracker: WorkTracker
  readonly spansOf: (week: string) => WeekSpansKnown
  /** Changes whenever `spansOf` may answer differently. */
  readonly revision: () => number
  readonly onChange: (listener: () => void) => () => void
}
