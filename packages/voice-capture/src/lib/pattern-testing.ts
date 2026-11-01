/**
 * Stand-ins for the take pattern's other ports, beside the
 * simulated microphone in `@some-ui/voice-capture/testing`: a player whose
 * playbacks end when the test says, a screen's store of takes held in
 * memory that keeps D2 and D3 as a real store must (a redo supersedes the
 * earlier take in the same write; Let go sets a take aside, keeping it), a
 * shelf of audio held in memory, for a screen's own store under test, and
 * the real pattern over all of them (`simulatedPattern`).
 */
import type { BlobShelf } from "./blob-shelf"
import { ShelfFullError } from "./blob-shelf"
import { microphoneOwner } from "./owner"
import type { Playback, Player } from "./player"
import type { Take } from "./recorder"
import type { SimulatedMicrophone } from "./simulated-microphone"
import { simulatedMicrophone } from "./simulated-microphone"
import type { KeepResult } from "./take-kit"
import type {
  PatternTake,
  TakeKept,
  TakePattern,
  TakePatternOptions,
  TakePatternPorts,
} from "./take-pattern"
import { ON_PHONE, ONE_TAKE, takePattern } from "./take-pattern"

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
  /**
   * The take kept answering `answers` at or after `since` (ms since the
   * epoch), the earliest such; null when none is.
   */
  readonly keptOn: (answers: string, since: number) => string | null
  /** The pattern's store ports: `keep`, `setAside`, `discard` and `audio`. */
  readonly ports: Pick<
    TakePatternPorts,
    "keep" | "setAside" | "discard" | "audio"
  >
  /**
   * Deletes these takes for good, of those still waiting (`held`); says
   * whether every one was.
   */
  readonly discard: (ids: ReadonlyArray<string>) => boolean
  /** Sends these waiting takes: each is then going home. */
  readonly release: (ids: ReadonlyArray<string>) => boolean
}

/**
 * A screen's takes in memory, each kept at once under `take-<n>` on this
 * phone, with `now` as when it was recorded. `seed` starts it with takes.
 */
export function memoryTakes(options: {
  readonly now: () => number
  readonly seed?: ReadonlyArray<PatternTake> | undefined
  readonly kept?: TakeKept | undefined
  /** Each take waits on the phone until `release` (`send: "on-confirm"`). */
  readonly held?: boolean | undefined
}): MemoryTakes {
  let takes: ReadonlyArray<PatternTake> = options.seed ?? []
  const audio = new Map<string, Blob>()
  const listeners = new Set<() => void>()
  const waiting = new Set<string>()
  let next = takes.length
  const write = (to: ReadonlyArray<PatternTake>): void => {
    takes = to
    for (const listener of listeners) listener()
  }
  const discard = (ids: ReadonlyArray<string>): boolean => {
    const gone = ids.filter((id) => waiting.has(id))
    for (const id of gone) {
      waiting.delete(id)
      audio.delete(id)
    }
    if (gone.length > 0) write(takes.filter((take) => !gone.includes(take.id)))
    return gone.length === ids.length
  }
  return {
    getSnapshot: () => takes,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    keptOn: (answers, since): string | null =>
      takes
        .filter(
          (take) =>
            take.answers === answers && Date.parse(take.recordedAt) >= since
        )
        .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))[0]?.id ??
      null,
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
        if (options.held === true) waiting.add(id)
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
            kept: options.held === true ? ON_PHONE : (options.kept ?? ON_PHONE),
          },
        ])
        done({ outcome: "kept", id })
      },
      discard: (id: string, done: (stored: boolean) => void): void => {
        done(discard([id]))
      },
      setAside: (id: string, done: (stored: boolean) => void): void => {
        write(
          takes.map(
            (kept): PatternTake =>
              kept.id === id ? { ...kept, standing: "set-aside" } : kept
          )
        )
        done(true)
      },
      audio: (id: string) =>
        Promise.resolve(
          audio.get(id) ??
            (takes.some((kept) => kept.id === id)
              ? new Blob(["v"], { type: "audio/webm" })
              : null)
        ),
    },
    discard,
    release: (ids): boolean => {
      const sent = ids.filter((id) => waiting.delete(id))
      if (sent.length > 0) {
        write(
          takes.map(
            (take): PatternTake =>
              sent.includes(take.id)
                ? { ...take, kept: { place: "going" } }
                : take
          )
        )
      }
      return true
    },
  }
}

/** A `BlobShelf` in memory: what is put is there until removed; `full` refuses every `put`. */
export function memoryShelf({
  full = false,
}: { readonly full?: boolean } = {}): BlobShelf {
  const audio = new Map<string, Blob>()
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
  }
}

export type SimulatedPattern = {
  readonly pattern: TakePattern
  readonly mic: SimulatedMicrophone
  readonly player: SimulatedPlayer
  readonly store: MemoryTakes
  /** How the store answers each take it is asked to keep from now on. */
  readonly keeping: (how: KeepResult["outcome"]) => void
}

/**
 * The real take pattern over the simulated microphone and player, its takes
 * in memory, on a one-microphone owner of its own, so a take one test leaves
 * holds no other's microphone. `recordedAt` is the store's clock; `seed`
 * starts it with takes. It answers on the timers a test fakes.
 */
export function simulatedPattern(
  setup: {
    readonly options?: TakePatternOptions
    readonly recordedAt?: () => number
    readonly seed?: ReadonlyArray<PatternTake>
  } = {}
): SimulatedPattern {
  const mic = simulatedMicrophone({ now: Date.now })
  const player = simulatedPlayer()
  const store = memoryTakes({
    now: setup.recordedAt ?? Date.now,
    seed: setup.seed,
    held: setup.options?.send === "on-confirm",
  })
  let how: KeepResult["outcome"] = "kept"
  const pattern = takePattern(
    {
      startRecording: mic.startRecording,
      now: Date.now,
      owner: microphoneOwner(),
      player,
      ...store.ports,
      keep: (take, answers, supersedes, done) => {
        if (how === "kept") store.ports.keep(take, answers, supersedes, done)
        else done({ outcome: how })
      },
    },
    setup.options ?? ONE_TAKE
  )
  return {
    pattern,
    mic,
    player,
    store,
    keeping: (next): void => {
      how = next
    },
  }
}

/** The take button the pattern's parts draw (`data-take`, `@some-ui/shared`). */
export function takeButton(root: ParentNode = document): HTMLElement {
  const button = root.querySelector<HTMLElement>("[data-take]")
  if (button === null) throw new Error("no take button")
  return button
}
