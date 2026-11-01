/**
 * A desk of takes on the take pattern (`@some-ui/voice-capture`'s
 * `takePattern`): Rust Rounds' voice notes and LeetType's spoken answers.
 * The pattern records, plays a take back, and says how each take ended;
 * this is its store: each take's audio
 * on a shelf and its entry in a list, as the lens's desk keeps them
 * (`./runtime`).
 *
 * - **One current take per item** (`per: "one"`, Rust Rounds and LeetType),
 *   or many beside each other (the grammar lens, `DeskShape`). A Redo's take
 *   becomes the item's take and the one it supersedes an earlier take, in
 *   the same write (D2). Let go marks a take set aside (D3). Neither removes
 *   anything: both stay listed, with their audio, and go home as every take
 *   of their kind does.
 * - **Bounded as the lens's desk is** (HF5, #2180): at most `limits.max`
 *   takes, each at most `limits.maxMs`. At the most a new take makes room by
 *   letting go the oldest take home holds (`kept`); with none held it is
 *   refused, and the pattern says so. Takes leave otherwise only by `letGo`,
 *   which the desk's sweep calls for a take whose audio never landed.
 * - **Where each take is kept**, and since when, is read from `kept` (MIC3):
 *   on this phone, going home while its copy waits in the voice lane, or on
 *   home since this phone heard home hold it. A desk whose kind no lane
 *   carries is never told, so each of its takes is kept on this phone.
 */
import { SOUNDBITE_MIN_MS } from "@some-ui/soundbites/contract"
import type {
  BlobShelf,
  MicOwner,
  PatternTake,
  Player,
  StartRecording,
  TakeDeadlines,
  TakeKept,
  TakePattern,
  TakePatternOptions,
} from "@some-ui/voice-capture"
import { ONE_TAKE, shelveTake, takePattern } from "@some-ui/voice-capture"

import type { Take, TakeLimits } from "./runtime"
import { homeHolds, makesRoom } from "./runtime"

export type PatternTakesPorts = {
  startRecording: StartRecording
  audio: BlobShelf
  /** The kept takes, newest first. */
  takes: {
    read: () => Array<Take>
    /**
     * Lists `take` first, and marks the take it supersedes an earlier one,
     * in one write. Says whether the device stored it.
     */
    add: (take: Take, supersedes?: string | null) => boolean
    remove: (ids: ReadonlyArray<string>) => boolean
    /** Marks a take set aside, keeping it. Says whether the device stored it. */
    setAside: (id: string) => boolean
  }
  /** A take whose audio is being written, and when done. */
  saving: (id: string, inFlight: boolean) => void
  now: () => number
  newId: () => string
  /** Where this take is kept, from what home told this phone (`lib/home-link`). */
  kept: (id: string) => TakeKept
  /** The kit's `audioPlayer` unless a test gives its own. */
  player?: Player | undefined
  /** The phone's one microphone unless a test gives its own. */
  owner?: MicOwner | undefined
  /** The microphone's deadlines unless a test gives its own. */
  deadlines?: TakeDeadlines | undefined
}

/** The takes as the pattern lists them, newest first. */
type PatternTakes = {
  /** The same array while nothing changed. */
  readonly getSnapshot: () => ReadonlyArray<PatternTake>
  readonly subscribe: (listener: () => void) => () => void
}

export type PatternPhone = {
  readonly pattern: TakePattern
  readonly takes: PatternTakes
  /** No new take can be kept until home holds some of those kept. */
  readonly full: () => boolean
  /**
   * Lets these takes go, with their audio: the sweep's, for audio that never
   * landed. Says whether the list stored it.
   */
  readonly letGo: (ids: ReadonlyArray<string>) => boolean
  /** Where takes are kept has changed: each row, and `full`. */
  readonly recount: () => void
}

const takenAt = (take: Take): number => take.takenAt

/** How many takes an item keeps, and which of them play: `ONE_TAKE`'s unless a desk says. */
export type DeskShape = Pick<TakePatternOptions, "takes" | "play">

function deskPatternOptions(
  limits: TakeLimits,
  shape: DeskShape
): TakePatternOptions {
  return {
    ...ONE_TAKE,
    ...shape,
    limits: { minMs: SOUNDBITE_MIN_MS, maxMs: limits.maxMs },
  }
}

export function createPatternTakes(
  ports: PatternTakesPorts,
  limits: TakeLimits,
  shape: DeskShape = ONE_TAKE
): PatternPhone {
  const listeners = new Set<() => void>()
  const held = (id: string): boolean => homeHolds(ports.kept(id))
  const listed = (): ReadonlyArray<PatternTake> =>
    ports.takes.read().map(
      (take): PatternTake => ({
        id: take.id,
        answers: take.line,
        durationMs: take.durationMs,
        recordedAt: new Date(take.takenAt).toISOString(),
        standing: take.standing ?? "current",
        kept: ports.kept(take.id),
      })
    )
  let snapshot = listed()
  const publish = (): void => {
    snapshot = listed()
    for (const listener of listeners) listener()
  }

  const full = (): boolean => {
    const takes = ports.takes.read()
    return (
      takes.length >= limits.max &&
      makesRoom(takes, limits.max, held, takenAt) === null
    )
  }

  const letGo = (ids: ReadonlyArray<string>): boolean => {
    if (ids.length === 0) return true
    // The list first: audio whose entry stays would leave a silent take.
    const stored = ports.takes.remove(ids)
    if (stored) {
      // Ignored: audio no take names is cleared by the next sweep.
      ports.audio.remove(ids).catch(() => undefined)
    }
    publish()
    return stored
  }

  const pattern = takePattern(
    {
      startRecording: ports.startRecording,
      now: ports.now,
      owner: ports.owner,
      deadlines: ports.deadlines,
      player: ports.player,
      keep: (take, answers, supersedes, done) => {
        if (full()) {
          done({ outcome: "full" })
          return
        }
        // RM1: a room not made keeps nothing, so the list never drops a
        // take at its cap to fit this one.
        const room = makesRoom(ports.takes.read(), limits.max, held, takenAt)
        if (room !== null && !letGo([room.id])) {
          done({ outcome: "failed" })
          return
        }
        const id = ports.newId()
        shelveTake(
          ports,
          id,
          take,
          () => {
            const kept = ports.takes.add(
              {
                id,
                line: answers,
                takenAt: ports.now(),
                durationMs: Math.round(take.durationMs),
                mimeType: take.mimeType,
              },
              supersedes
            )
            if (kept) publish()
            return kept
          },
          (outcome) =>
            done(
              outcome === "kept"
                ? { outcome, id }
                : { outcome: outcome === "full" ? "full" : "failed" }
            )
        )
      },
      setAside: (id, done) => {
        const stored = ports.takes.setAside(id)
        if (stored) publish()
        done(stored)
      },
      audio: (id) => ports.audio.get(id),
    },
    deskPatternOptions(limits, shape)
  )

  return {
    pattern,
    takes: {
      getSnapshot: () => snapshot,
      subscribe(listener): () => void {
        listeners.add(listener)
        return (): void => {
          listeners.delete(listener)
        }
      },
    },
    full,
    letGo,
    recount: publish,
  }
}
