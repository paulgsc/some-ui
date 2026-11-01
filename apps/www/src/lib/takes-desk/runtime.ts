/**
 * A desk of takes answering prompts (topik's `LensTakes` port; LeetType's
 * spoken answers through `lib/leetype-takes`): `@some-ui/voice-capture`'s
 * voice note, each kept take's audio on a shelf and its entry in a list,
 * and the last one played back.
 *
 * - **Bounded on its own, an offline set, and nothing evicted before home
 *   holds it** (HF5, #2180). At most `limits.max` takes, each at most
 *   `limits.maxMs`. At the most a new take makes room by letting go the
 *   oldest take home holds (`held`); with none held it is refused and
 *   `full` says so. Takes leave otherwise only by `letGo`, which
 *   `takesDesk`'s sweep calls for a take whose audio never landed.
 * - **Every take's end is said** (VC2, `@some-ui/voice-capture`'s
 *   `voice-note.ts`). `ended` names how each take ended and the line it was
 *   started on, apart from `reset`'s hush, so a caller that moved on still
 *   hears that a take it left was kept or lost.
 * - **The last take is the item's.** `reset` forgets it, so the next item
 *   starts with none; a take still being kept when that happens is kept, but
 *   is not the next item's last. `kept` names every take kept, for the
 *   record to count on the item it was started on.
 */
import { SOUNDBITE_MIN_MS } from "@some-ui/soundbites/contract"
import type { LensTakes, LensTakeSnapshot } from "@some-ui/topik"
import type {
  BlobShelf,
  Playback,
  Player,
  RecordingFailure,
  StartRecording,
  VoiceNoteEnd,
} from "@some-ui/voice-capture"
import {
  shelveTake,
  takeView,
  voiceNoteEnd,
  voiceNoteRuntime,
  voiceNoteSaid,
} from "@some-ui/voice-capture"

/** How many takes a desk keeps, and how long each runs at most. */
export type TakeLimits = { readonly max: number; readonly maxMs: number }

/**
 * One kept take: what it answers, and when. `line` is a grammar-lens line's
 * id or a LeetType prompt's `<file>#<screen>`; the name stays so takes
 * already kept still read.
 */
export type Take = {
  id: string
  line: string
  takenAt: number
  durationMs: number
  mimeType: string
}

export type TakesPorts = {
  startRecording: StartRecording
  audio: BlobShelf
  /** The kept takes, newest first. */
  takes: {
    read: () => Array<Take>
    /** Says whether the device stored it. */
    add: (take: Take) => boolean
    remove: (ids: ReadonlyArray<string>) => boolean
  }
  /** A take whose audio is being written, and when done. */
  saving: (id: string, inFlight: boolean) => void
  player: Player
  now: () => number
  newId: () => string
  /** Whether home holds this take's audio, read back (`lib/home-link`). */
  held: (id: string) => boolean
}

/**
 * How a take ended, whatever `reset` has hushed since: every take that
 * starts ends in exactly one, `seq` counting them. For `blocked`, why is in
 * the snapshot's `blocked`.
 */
type TakeEnded = {
  readonly seq: number
  /** What the take was started on (`start`'s `reading`). */
  readonly line: string
  readonly end: VoiceNoteEnd
  /** The kept take's id, when `end` is `kept`. */
  readonly id: string | null
}

export type DeskSnapshot = LensTakeSnapshot & {
  /** The last take to end, never hushed. */
  readonly ended: TakeEnded | null
  /** Why the microphone refused the last take, while it is refused. */
  readonly blocked: RecordingFailure | null
}

/** The port, and the sweep's way to let takes go (`takesDesk`). */
export type PhoneTakes = Omit<LensTakes, "getSnapshot"> & {
  getSnapshot: () => DeskSnapshot
  /** Lets these takes go, with their audio. */
  letGo: (ids: ReadonlyArray<string>) => void
  /** Says `full` again: what home holds has changed. */
  recount: () => void
}

/**
 * The item a new one makes room by letting go at `max`: the oldest by `at`
 * of those home holds (`held`), or null while there is room or home holds
 * none. The takes' and LeetType's answer notes' (`lib/leetype-takes`).
 */
export function makesRoom<T extends { readonly id: string }>(
  items: ReadonlyArray<T>,
  max: number,
  held: (id: string) => boolean,
  at: (item: T) => number
): T | null {
  if (items.length < max) return null
  let oldest: T | null = null
  for (const item of items) {
    if (held(item.id) && (oldest === null || at(item) < at(oldest))) {
      oldest = item
    }
  }
  return oldest
}

const takenAt = (take: Take): number => take.takenAt

export function createTakes(ports: TakesPorts, limits: TakeLimits): PhoneTakes {
  const listeners = new Set<() => void>()
  let last: LensTakeSnapshot["last"] = null
  let kept: LensTakeSnapshot["kept"] = null
  let playback: Playback | null = null
  // Bumped by every play, stop and reset: a read that lands after is stale.
  let playRequest = 0
  // Bumped by `reset`: a take started before it is not the new item's.
  let item = 0
  /** The take under way: the line it reads, and the item it was started on. */
  let taking = { line: "", item: 0 }
  // Reset hushes the last take's outcome, which was about the item before.
  let quiet = false

  const full = (): boolean => {
    const takes = ports.takes.read()
    return (
      takes.length >= limits.max &&
      makesRoom(takes, limits.max, ports.held, takenAt) === null
    )
  }

  /** Lets these takes go, with their audio, and says so. */
  const letGo = (ids: ReadonlyArray<string>): void => {
    if (ids.length === 0) return
    if (last && ids.includes(last.id)) last = null
    // The list first: audio whose entry stays would leave a silent take.
    if (ports.takes.remove(ids)) {
      // Ignored: audio no take names is cleared by the next sweep.
      ports.audio.remove(ids).catch(() => undefined)
    }
    publish()
  }

  const note = voiceNoteRuntime(
    {
      startRecording: ports.startRecording,
      now: ports.now,
      // `sweepLensTakes` clears what a failed listing leaves.
      save: (take, _atMs, saved) => {
        const id = ports.newId()
        const { line, item: forItem } = taking
        const durationMs = Math.round(take.durationMs)
        if (full()) {
          saved("full")
          return
        }
        const room = makesRoom(
          ports.takes.read(),
          limits.max,
          ports.held,
          takenAt
        )
        if (room !== null) letGo([room.id])
        shelveTake(
          ports,
          id,
          take,
          () => {
            const listed = ports.takes.add({
              id,
              line,
              takenAt: ports.now(),
              durationMs,
              mimeType: take.mimeType,
            })
            if (listed) kept = { id, durationMs }
            if (listed && forItem === item) last = kept
            return listed
          },
          saved
        )
      },
    },
    { minMs: SOUNDBITE_MIN_MS, maxMs: limits.maxMs }
  )

  let ended: TakeEnded | null = null
  let busy = false

  const snapshotOf = (): DeskSnapshot => {
    const state = note.getSnapshot()
    return {
      take: takeView(state),
      said: voiceNoteSaid(state, quiet),
      last,
      kept,
      playing: playback !== null,
      full: full(),
      ended,
      blocked: state.kind === "blocked" ? state.reason : null,
    }
  }
  let snapshot = snapshotOf()
  const publish = (): void => {
    snapshot = snapshotOf()
    for (const listener of listeners) listener()
  }
  note.subscribe(() => {
    // A take ends when the note leaves taking or saving, however it ends.
    const state = note.getSnapshot()
    const now = state.kind === "taking" || state.kind === "saving"
    const end = voiceNoteEnd(state)
    if (busy && end !== null) {
      ended = {
        seq: (ended?.seq ?? 0) + 1,
        line: taking.line,
        end,
        id: end === "kept" ? (kept?.id ?? null) : null,
      }
    }
    busy = now
    publish()
  })

  const stopPlayback = (): void => {
    playRequest += 1
    playback?.stop()
    playback = null
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    start: (reading): void => {
      if (snapshot.take.kind !== "idle" || snapshot.full) return
      stopPlayback()
      taking = { line: reading, item }
      quiet = false
      note.start(null)
    },
    stop: (): void => {
      note.stop()
      const wasPlaying = playback !== null
      // Always: a playback still being read must not start after a stop.
      stopPlayback()
      if (wasPlaying) publish()
    },
    playLast: (): void => {
      const playing = last
      if (!playing || snapshot.take.kind !== "idle") return
      const wasPlaying = playback !== null
      stopPlayback()
      // The one playing has stopped, whether or not the new read lands.
      if (wasPlaying) publish()
      const request = playRequest
      ports.audio.get(playing.id).then(
        (blob) => {
          // Gone, or stopped, or another take, item or playback since.
          const idle = snapshot.take.kind === "idle" && playback === null
          const current = request === playRequest && last?.id === playing.id
          if (!blob || !current || !idle) return
          const started = ports.player.play(blob)
          playback = started
          publish()
          void started.ended.then(() => {
            if (playback !== started) return
            playback = null
            publish()
          })
        },
        () => undefined
      )
    },
    letGo,
    recount: (): void => {
      if (full() !== snapshot.full) publish()
    },
    reset: (): void => {
      item += 1
      note.leave()
      stopPlayback()
      last = null
      quiet = true
      publish()
    },
  }
}
