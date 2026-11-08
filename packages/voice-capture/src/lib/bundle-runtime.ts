/**
 * Runs a bundle's machine (`./bundle`) against the outside world: the take
 * pattern on the phone's desk of the bundle's takes (with `send:
 * "on-confirm"`), the draft, the records kept, what the spec reads when the
 * screen opens, and home. It turns each effect into a call on a port and
 * each answer into an event, stamps each tap with when it happened, and
 * decides nothing: which answer still counts is the step's.
 *
 * Send is three writes in one order: the record joins the records kept,
 * which only grow; then the takes it names are let go home; then the draft
 * is cleared. A Send stopped between them leaves takes a kept record names
 * waiting, which the next opening lets go (`settle`), and a draft already
 * kept, which it clears.
 */
import { assertNever } from "@some-ui/core-utils"

import type {
  BundleEffect,
  BundleEvent,
  BundleIntent,
  BundleKind,
  BundleMachine,
  BundleState,
  HomeReach,
} from "./bundle"
import type { PatternTake, TakePattern } from "./take-pattern"

/** The phone's desk of a bundle's takes, as a bundle uses it. */
export type BundleTakes = {
  /** The take pattern, with `send: "on-confirm"`. */
  readonly pattern: TakePattern
  /** The takes as the pattern lists them, the same array while unchanged. */
  readonly takes: {
    readonly getSnapshot: () => ReadonlyArray<PatternTake>
    readonly subscribe: (listener: () => void) => () => void
  }
  /**
   * Deletes these takes for good, with their audio, of those that never
   * left the phone; says whether every one was.
   */
  readonly discard: (ids: ReadonlyArray<string>) => boolean
  /** Lets these takes go home: their record is sent. Says whether kept. */
  readonly release: (ids: ReadonlyArray<string>) => boolean
}

/** Home, as a bundle needs it. */
export type BundleHome = {
  readonly reach: () => HomeReach
  readonly subscribe: (listener: () => void) => () => void
}

/** No home: a phone never paired. */
export const NO_HOME: BundleHome = {
  reach: () => "unpaired",
  subscribe: () => () => undefined,
}

/** The draft kept on this phone: one at a time. */
export type BundleDrafts<D> = {
  /**
   * The draft kept, `null` when there is none; `undefined` when what is
   * kept can't be read.
   */
  readonly read: () => D | null | undefined
  /** Keeps `draft` in place of any other, or clears it; false when not kept. */
  readonly write: (draft: D | null) => boolean
}

/** The records Send keeps, which only grow. */
export type BundleRecords<R> = {
  /** Every record kept, or null when what is kept can't be read. */
  readonly list: () => ReadonlyArray<R> | null
  /**
   * Keeps the records `change` returns from those kept; the records as
   * kept, or null when nothing could be.
   */
  readonly keep: (
    change: (kept: ReadonlyArray<R>) => ReadonlyArray<R>
  ) => ReadonlyArray<R> | null
}

export type BundlePorts<K extends BundleKind> = {
  readonly takes: BundleTakes
  readonly drafts: BundleDrafts<K["draft"]>
  readonly records: BundleRecords<K["record"]>
  /** What the spec reads when the screen opens (an idea's lists). */
  readonly context: () => K["context"]
  readonly home: BundleHome
  /** Milliseconds since the epoch. */
  readonly now: () => number
  /** A new draft's id: letters, digits and dashes. */
  readonly newId: () => string
  /** As `onPageVisibility`: now, then on each change. */
  readonly onVisibility: (listener: (hidden: boolean) => void) => () => void
}

export type BundleRuntime<K extends BundleKind> = {
  readonly getSnapshot: () => BundleState<K>
  readonly subscribe: (listener: () => void) => () => void
  readonly dispatch: (intent: BundleIntent<K>) => void
  /** The screen is showing. Returns the detach. */
  readonly attach: () => () => void
}

export function bundleRuntime<K extends BundleKind>(
  machine: BundleMachine<K>,
  ports: BundlePorts<K>
): BundleRuntime<K> {
  const at = (): string => new Date(ports.now()).toISOString()
  let state = machine.initial(ports.context(), ports.newId(), at())
  const listeners = new Set<() => void>()
  const { pattern } = ports.takes
  const { idOf } = machine.spec

  const send = (event: BundleEvent<K>): void => {
    const next = machine.stepBundle(state, event)
    if (next.state !== state) {
      state = next.state
      for (const listener of listeners) listener()
    }
    for (const effect of next.effects) run(effect)
  }

  function run(effect: BundleEffect<K>): void {
    switch (effect.type) {
      case "open": {
        send({
          type: "opened",
          draft: ports.drafts.read(),
          kept: ports.records.list(),
          takes: ports.takes.takes.getSnapshot(),
          context: ports.context(),
          id: ports.newId(),
          at: at(),
        })
        return
      }
      case "keepDraft": {
        send({ type: "draftKept", kept: ports.drafts.write(effect.draft) })
        return
      }
      case "tap": {
        if (effect.draft !== undefined) {
          const kept = ports.drafts.write(effect.draft)
          send({ type: "draftKept", kept })
          if (!kept) return
        }
        pattern.tap(effect.answers, effect.supersedes)
        return
      }
      case "play": {
        pattern.play(effect.take)
        return
      }
      case "stopPlaying": {
        pattern.stopPlaying()
        return
      }
      case "deleteTakes": {
        send({ type: "deleted", deleted: ports.takes.discard(effect.takes) })
        return
      }
      case "drop": {
        // Ignored: a take that couldn't be dropped is dropped at the next
        // opening, and waits on the phone, unsent, until then.
        ports.takes.discard(effect.takes)
        return
      }
      case "deleteAll": {
        pattern.stopPlaying()
        const deleted =
          ports.takes.discard(effect.takes) && ports.drafts.write(null)
        send({ type: "deletedAll", deleted, id: ports.newId(), at: at() })
        return
      }
      case "send": {
        const { record } = effect
        const id = idOf(record)
        const named = (records: ReadonlyArray<K["record"]>): boolean =>
          records.some((each) => idOf(each) === id)
        // Only a record added now lets takes go: one already kept under the
        // id names other takes, so these would go home named by none.
        const before = ports.records.list()
        const kept =
          before === null || named(before)
            ? null
            : ports.records.keep((records) =>
                named(records) ? records : [...records, record]
              )
        const sent = kept?.find((each) => idOf(each) === id) ?? null
        if (sent !== null) {
          ports.takes.release(effect.takes)
          ports.drafts.write(null)
        }
        send({ type: "sentKept", record: sent })
        return
      }
      case "settle": {
        ports.takes.release(effect.takes)
        return
      }
      case "leave": {
        pattern.leave()
        return
      }
      default: {
        assertNever(effect)
      }
    }
  }

  /** What the pattern says, as the machine's events: only what changed. */
  let seen = pattern.getSnapshot()
  const watchPattern = (): void => {
    const now = pattern.getSnapshot()
    const before = seen
    seen = now
    const busy = now.take.kind !== "idle"
    if (busy !== (before.take.kind !== "idle")) send({ type: "busy", busy })
    if (now.ended !== null && now.ended !== before.ended) {
      send({ type: "ended", ended: now.ended })
    }
    const playing = now.playback.kind === "quiet" ? null : now.playback.id
    send({ type: "playing", take: playing })
  }

  return {
    getSnapshot: () => state,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    dispatch: (intent) =>
      send(
        intent.type === "another"
          ? { type: "another", at: at(), id: ports.newId() }
          : { ...intent, at: at() }
      ),
    attach(): () => void {
      seen = pattern.getSnapshot()
      const stops = [
        // Hidden, a take under way finishes and is kept, as on leaving.
        ports.onVisibility((hidden) => {
          if (hidden) send({ type: "hidden" })
        }),
        pattern.subscribe(watchPattern),
        ports.takes.takes.subscribe(() =>
          send({ type: "takes", takes: ports.takes.takes.getSnapshot() })
        ),
        ports.home.subscribe(() =>
          send({ type: "reach", reach: ports.home.reach() })
        ),
      ]
      send({ type: "entered", at: at() })
      send({ type: "reach", reach: ports.home.reach() })
      if (seen.take.kind !== "idle") send({ type: "busy", busy: true })
      return () => {
        for (const stop of stops) stop()
        send({ type: "left" })
      }
    },
  }
}
