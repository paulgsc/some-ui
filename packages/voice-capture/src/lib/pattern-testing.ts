/**
 * Stand-ins for the take pattern's other ports, beside the
 * simulated microphone in `@some-ui/voice-capture/testing`: a player whose
 * playbacks end when the test says, a screen's store of takes held in
 * memory that keeps D2 and D3 as a real store must (a redo supersedes the
 * earlier take in the same write; Let go sets a take aside, keeping it), and
 * a shelf of audio held in memory, for a screen's own store under test.
 */
import type { BlobShelf } from "./blob-shelf"
import { ShelfFullError } from "./blob-shelf"
import type { Playback, Player } from "./player"
import type { Take } from "./recorder"
import type { KeepResult } from "./take-kit"
import type { PatternTake, TakePatternPorts, TakePlace } from "./take-pattern"

export type SimulatedPlayer = Player & {
  /** Playbacks under way now. */
  readonly playing: () => number
  /** Ends every playback under way, as audio reaching its end does. */
  readonly finish: () => void
}

export function simulatedPlayer(): SimulatedPlayer {
  const live = new Set<Playback>()
  return {
    play(): Playback {
      let settle: () => void = () => undefined
      const ended = new Promise<void>((resolve) => {
        settle = resolve
      })
      const playback: Playback = {
        ended,
        stop: (): void => {
          live.delete(playback)
          settle()
        },
      }
      live.add(playback)
      return playback
    },
    playing: () => live.size,
    finish: (): void => {
      for (const playback of [...live]) playback.stop()
    },
  }
}

export type MemoryTakes = {
  readonly getSnapshot: () => ReadonlyArray<PatternTake>
  readonly subscribe: (listener: () => void) => () => void
  /** The pattern's store ports: `keep`, `setAside` and `audio`. */
  readonly ports: Pick<TakePatternPorts, "keep" | "setAside" | "audio">
}

/**
 * A screen's takes in memory, each kept at once under `take-<n>` on this
 * phone, with `now` as when it was recorded. `seed` starts it with takes.
 */
export function memoryTakes(options: {
  readonly now: () => number
  readonly seed?: ReadonlyArray<PatternTake> | undefined
  readonly place?: TakePlace | undefined
}): MemoryTakes {
  let takes: ReadonlyArray<PatternTake> = options.seed ?? []
  const audio = new Map<string, Blob>()
  const listeners = new Set<() => void>()
  let next = takes.length
  const write = (to: ReadonlyArray<PatternTake>): void => {
    takes = to
    for (const listener of listeners) listener()
  }
  return {
    getSnapshot: () => takes,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    ports: {
      keep: (
        take: Take,
        answers: string,
        supersedes: string | null,
        done: (result: KeepResult) => void
      ): void => {
        next += 1
        const id = `take-${next}`
        audio.set(id, take.blob)
        write([
          ...takes.map(
            (kept): PatternTake =>
              kept.id === supersedes ? { ...kept, standing: "earlier" } : kept
          ),
          {
            id,
            answers,
            durationMs: take.durationMs,
            recordedAt: new Date(options.now()).toISOString(),
            standing: "current",
            place: options.place ?? "phone",
          },
        ])
        done({ outcome: "kept", id })
      },
      setAside: (id: string): void => {
        write(
          takes.map(
            (kept): PatternTake =>
              kept.id === id ? { ...kept, standing: "set-aside" } : kept
          )
        )
      },
      audio: (id: string) =>
        Promise.resolve(
          audio.get(id) ??
            (takes.some((kept) => kept.id === id)
              ? new Blob(["v"], { type: "audio/webm" })
              : null)
        ),
    },
  }
}

export type MemoryShelf = BlobShelf & {
  /** Every `put` from now on refuses as a phone out of room does. */
  readonly fill: (full: boolean) => void
}

/** A `BlobShelf` in memory: what is put is there until removed. */
export function memoryShelf(): MemoryShelf {
  const audio = new Map<string, Blob>()
  let full = false
  return {
    put: (id, blob): Promise<void> => {
      if (full) return Promise.reject(new ShelfFullError())
      audio.set(id, blob)
      return Promise.resolve()
    },
    get: (id) => Promise.resolve(audio.get(id) ?? null),
    remove: (ids): Promise<void> => {
      for (const id of ids) audio.delete(id)
      return Promise.resolve()
    },
    ids: () => Promise.resolve([...audio.keys()]),
    fill: (on): void => {
      full = on
    },
  }
}
