/**
 * Topik's `LensTakes` port (adaptive-learning canon Rem. 4.16):
 * `@some-ui/voice-capture`'s voice note, each kept take's audio on a shelf
 * and its entry in a list, and the last one played back.
 *
 * - **Bounded on its own, and never evicted.** At most forty, each at most
 *   thirty seconds. At forty a new take is refused and `full` says so; takes
 *   leave only by `letGo`, once the learner says an export carrying them
 *   arrived.
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
  StartRecording,
} from "@some-ui/voice-capture"
import {
  shelveTake,
  takeView,
  voiceNoteRuntime,
  voiceNoteSaid,
} from "@some-ui/voice-capture"

import { LENS_TAKE_MAX_MS, LENS_TAKES_MAX } from "./budget"

const LIMITS = { minMs: SOUNDBITE_MIN_MS, maxMs: LENS_TAKE_MAX_MS }

/** One kept take: which line it reads, and when. */
export type LensTake = {
  id: string
  line: string
  takenAt: number
  durationMs: number
  mimeType: string
}

export type LensTakesPorts = {
  startRecording: StartRecording
  audio: BlobShelf
  /** The kept takes, newest first. */
  takes: {
    read: () => Array<LensTake>
    /** Says whether the device stored it. */
    add: (take: LensTake) => boolean
    remove: (ids: ReadonlyArray<string>) => boolean
  }
  /** A take whose audio is being written, and when done. */
  saving: (id: string, inFlight: boolean) => void
  player: Player
  now: () => number
  newId: () => string
}

/** The port, and the export's hand-off (`lensTakesForExport`'s `letGo`). */
export type PhoneLensTakes = LensTakes & {
  /** These went out in an export the learner says arrived: they leave. */
  letGo: (ids: ReadonlyArray<string>) => void
}

export function createLensTakes(ports: LensTakesPorts): PhoneLensTakes {
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

  const full = (): boolean => ports.takes.read().length >= LENS_TAKES_MAX

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
    LIMITS
  )

  const snapshotOf = (): LensTakeSnapshot => {
    const state = note.getSnapshot()
    return {
      take: takeView(state),
      said: voiceNoteSaid(state, quiet),
      last,
      kept,
      playing: playback !== null,
      full: full(),
    }
  }
  let snapshot = snapshotOf()
  const publish = (): void => {
    snapshot = snapshotOf()
    for (const listener of listeners) listener()
  }
  note.subscribe(publish)

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
    letGo: (ids): void => {
      if (ids.length === 0) return
      if (last && ids.includes(last.id)) last = null
      // The list first: audio whose entry stays would leave a silent take.
      if (ports.takes.remove(ids)) {
        ports.audio.remove(ids).catch(() => undefined)
      }
      publish()
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
