/**
 * A session's spoken reflections on the take pattern (`@some-ui/voice-capture`'s
 * `takePattern`): each kept take a reflection of its session, its audio on a
 * shelf beside the reflections' list under the reflection's id. It decides
 * nothing but what a keep writes.
 *
 * - **Up to `REFLECTION_LIMIT` a session**, beside each other, each played
 *   on its own. Redo makes the new take the session's and keeps the one it
 *   records again, out of view (D2); Let go sets one aside, kept (D3). Both
 *   stay listed, with their audio, and go home as every spoken reflection
 *   does; neither removes anything (#2265, MIC5).
 * - **Where each is kept**, and since when, is read from the voice lane
 *   (`kept`, MIC3).
 */
import { SOUNDBITE_TAKE_LIMITS } from "@some-ui/soundbites/contract"
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
import { ONE_TAKE, ShelfFullError, takePattern } from "@some-ui/voice-capture"

import type { KeepResult, Reflection } from "@/lib/session-reflection"
import { REFLECTION_LIMIT } from "@/lib/session-reflection"

import { REDO_REFUSED } from "./words"

/** The reflections' choice of the pattern's options. */
const REFLECTION_TAKE_OPTIONS: TakePatternOptions = {
  ...ONE_TAKE,
  takes: { per: "many", max: REFLECTION_LIMIT, full: "refuse" },
  limits: SOUNDBITE_TAKE_LIMITS,
}

export type VoicePorts = {
  startRecording: StartRecording
  audio: BlobShelf
  /** Every reflection kept, as the list holds them. */
  read: () => ReadonlyArray<Reflection>
  /** Tells `listener` when the list, or where its notes are kept, changes. */
  subscribe: (listener: () => void) => () => void
  keep: (reflection: Reflection) => KeepResult
  /** Marks a spoken reflection a Redo recorded again (D2); says whether it stored. */
  supersede: (id: string) => boolean
  /** Marks a spoken reflection set aside (D3); says whether it stored. */
  setAside: (id: string) => boolean
  /** Takes back out a reflection whose audio could not be kept. */
  letGo: (ids: ReadonlyArray<string>) => void
  /** A kept voice reflection whose audio is being written, and when done. */
  saving: (id: string, inFlight: boolean) => void
  /** Milliseconds since the epoch. */
  now: () => number
  newId: () => string
  /** Where a spoken reflection is kept, from what home told this phone. */
  kept: (id: string) => TakeKept
  /** The kit's `audioPlayer` unless a test gives its own. */
  player?: Player | undefined
  /** The phone's one microphone unless a test gives its own. */
  owner?: MicOwner | undefined
  /** The microphone's deadlines unless a test gives its own. */
  deadlines?: TakeDeadlines | undefined
}

export type ReflectionTakes = {
  readonly pattern: TakePattern
  /**
   * D1: starts a take said `atMs` into the session (null after it ended),
   * superseding `supersedes` once kept (D2), or stops the one under way.
   */
  readonly tap: (atMs: number | null, supersedes?: string | null) => void
  /** The session's spoken reflections as the pattern lists them; the same array while nothing changed. */
  readonly getSnapshot: () => ReadonlyArray<PatternTake>
  /**
   * `REDO_REFUSED` once the phone kept a Redo's take but not the earlier one
   * moved out of view, until the next tap or step; null otherwise. A refused
   * Let go is the pattern's (`setAside`'s `done`).
   */
  readonly refused: () => string | null
  readonly subscribe: (listener: () => void) => () => void
}

export function createVoiceNote(
  ports: VoicePorts,
  sessionId: string
): ReflectionTakes {
  // How far into the session the take under way was started: one at a time.
  let startedAt: number | null = null
  let refused: string | null = null
  const refusedListeners = new Set<() => void>()
  const say = (next: string | null): void => {
    if (next === refused) return
    refused = next
    for (const listener of refusedListeners) listener()
  }

  const pattern = takePattern(
    {
      startRecording: ports.startRecording,
      now: ports.now,
      owner: ports.owner,
      deadlines: ports.deadlines,
      player: ports.player,
      /**
       * The reflection first, so it holds its slot (or says there is none),
       * then its audio; audio that cannot be kept takes the reflection back
       * out. In that order, audio on the shelf always has a reflection
       * naming it, and `sweepOrphans` can never remove a take still being
       * saved. Only a take kept supersedes: one whose audio fails leaves the
       * earlier take as it was.
       */
      keep: (take, _answers, supersedes, done) => {
        const id = ports.newId()
        const kept = ports.keep({
          id,
          sessionId,
          createdAt: new Date(ports.now()).toISOString(),
          atMs: startedAt,
          body: {
            kind: "voice",
            durationMs: Math.round(take.durationMs),
            mimeType: take.mimeType,
            bytes: take.blob.size,
          },
        })
        if (kept !== "kept") {
          done({ outcome: kept })
          return
        }
        ports.saving(id, true)
        ports.audio.put(id, take.blob).then(
          () => {
            ports.saving(id, false)
            if (supersedes !== null && !ports.supersede(supersedes)) {
              say(REDO_REFUSED)
            }
            done({ outcome: "kept", id })
          },
          (error: unknown) => {
            ports.saving(id, false)
            ports.letGo([id])
            done({
              outcome: error instanceof ShelfFullError ? "full" : "failed",
            })
          }
        )
      },
      // A Let go the phone won't store: the pattern takes its line back.
      setAside: (id, done) => {
        say(null)
        done(ports.setAside(id))
      },
      audio: (id) => ports.audio.get(id),
    },
    REFLECTION_TAKE_OPTIONS
  )

  let from: ReadonlyArray<Reflection> | null = null
  let listed: ReadonlyArray<PatternTake> = []
  let stale = true
  const read = (): ReadonlyArray<PatternTake> => {
    const kept = ports.read()
    if (stale || kept !== from) {
      from = kept
      stale = false
      listed = kept.flatMap((reflection): Array<PatternTake> => {
        const { body } = reflection
        if (reflection.sessionId !== sessionId || body.kind !== "voice") {
          return []
        }
        return [
          {
            id: reflection.id,
            answers: sessionId,
            durationMs: body.durationMs,
            recordedAt: reflection.createdAt,
            standing: body.standing ?? "current",
            kept: ports.kept(reflection.id),
          },
        ]
      })
    }
    return listed
  }

  return {
    pattern,
    tap: (atMs, supersedes = null): void => {
      if (pattern.getSnapshot().take.kind === "idle") startedAt = atMs
      say(null)
      pattern.tap(sessionId, supersedes)
    },
    getSnapshot: read,
    refused: () => refused,
    subscribe: (listener) => {
      refusedListeners.add(listener)
      const stop = ports.subscribe(() => {
        // Where a note is kept can move while the list stays the same.
        stale = true
        listener()
      })
      return (): void => {
        refusedListeners.delete(listener)
        stop()
      }
    },
  }
}
