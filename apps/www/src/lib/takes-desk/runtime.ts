/**
 * A desk of takes answering prompts on `@some-ui/voice-capture`'s take kit
 * (Studio's idea answers, `lib/idea-takes`): each kept take's audio on a
 * shelf and its entry in a list, and the last one played back. The kit
 * records how each take ended. The desks on the take pattern (`./pattern`)
 * share its bounds (`makesRoom`, `homeHolds`).
 *
 * - **Bounded on its own, an offline set, and nothing evicted before home
 *   holds it** (HF5, #2180). At most `limits.max` takes, each at most
 *   `limits.maxMs`. At the most a new take makes room by letting go the
 *   oldest take home holds (`held`); with none held it is refused and
 *   `full` says so. Takes leave otherwise only by `letGo`, which
 *   `takesDesk`'s sweep calls for a take whose audio never landed.
 * - **Every take's end is said** (VC2 and VC3, `@some-ui/voice-capture`'s
 *   `properties.ts`). `ended` names how each take ended and the line it was
 *   started on, apart from `reset`'s hush, so a caller that moved on still
 *   hears that a take it left was kept or lost.
 * - **The last take is the item's.** `reset` forgets it, so the next item
 *   starts with none; a take still being kept when that happens is kept, but
 *   is not the next item's last. `kept` names every take kept, for the
 *   record to count on the item it was started on.
 */
import { SOUNDBITE_MIN_MS } from "@some-ui/soundbites/contract"
import type {
  BlobShelf,
  MicOwner,
  Playback,
  Player,
  RecordingFailure,
  StartRecording,
  TakeDeadlines,
  TakeEnding,
  TakeKept,
  TakeKitView,
  TakeView,
} from "@some-ui/voice-capture"
import {
  shelveTake,
  TAKE_ENDING_WORDS,
  takeEndingSaid,
  takeKit,
} from "@some-ui/voice-capture"

/** What a kit desk shows of its takes. */
type KitTakeSnapshot = {
  take: TakeView
  /** Said once beside the button: how the last take ended, or why none can. */
  said: string | null
  /** The last take kept since the last `reset`. */
  last: { id: string; durationMs: number } | null
  /**
   * The last take kept, whatever item it was started on: a take cut off by
   * leaving lands after `reset`.
   */
  kept: { id: string; durationMs: number } | null
  /** The last take is playing back. */
  playing: boolean
  /** No new take can be kept until home holds some of those kept. */
  full: boolean
}

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
  /**
   * Out of its item's view, kept (`./pattern`): superseded by a Redo (D2)
   * or set aside (D3). Absent for the item's take, and on every kit desk's.
   */
  standing?: "earlier" | "set-aside"
  /**
   * When it was set aside (ms since the epoch), written with its standing
   * and never after: home's mark is sent with it (MIC2). Absent on one not
   * set aside, and on one set aside before the desk noted when.
   */
  setAsideAt?: number
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
  /** The phone's one microphone unless a test gives its own. */
  owner?: MicOwner | undefined
  /** The microphone's deadlines unless a test gives its own. */
  deadlines?: TakeDeadlines | undefined
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
  readonly end: TakeEnding
  /** The kept take's id, when `end` is `kept`. */
  readonly id: string | null
  /** Kept, and the microphone never heard talking in it (MIC8, D4). */
  readonly unheard: boolean
}

export type DeskSnapshot = KitTakeSnapshot & {
  /** The last take to end, never hushed. */
  readonly ended: TakeEnded | null
  /** Why the microphone refused the last take, while it is refused. */
  readonly blocked: RecordingFailure | null
}

/** The port, and the sweep's way to let takes go (`takesDesk`). */
export type PhoneTakes = {
  getSnapshot: () => DeskSnapshot
  subscribe: (listener: () => void) => () => void
  /** Starts a take answering `line`. */
  start: (line: string) => void
  /** Ends a take under way and keeps it, and stops a playback. */
  stop: () => void
  /** Plays the last take back. */
  playLast: () => void
  /** The item is done: a take under way is kept, and the last is forgotten. */
  reset: () => void
  /** Lets these takes go, with their audio; says whether the list stored it. */
  letGo: (ids: ReadonlyArray<string>) => boolean
  /** Says `full` again: what home holds has changed. */
  recount: () => void
  /** Whether home holds take `id`, as last read back (`held`). */
  held: (id: string) => boolean
}

/**
 * Whether home holds a take, so it may make room at a desk's cap (HF5): only
 * one on home. A take going home is on this phone alone until home holds it,
 * and letting it go would lose it (MIC3). Every desk reads `held` through
 * this.
 */
export function homeHolds(kept: TakeKept): boolean {
  return kept.place === "home"
}

/**
 * Whether `item`, kept at `kept`, may leave this phone on home's word
 * (LA13, MIC2): home holds it, and one set aside only once its set-aside
 * mark is safe (`marked`: owed in the voice-home record as storage kept
 * it, or answered), so no note leaves before home can be told it was let
 * go. Every make-room and let-go of a desk with Let go reads it.
 */
export function mayLeave(
  item: { readonly id: string; readonly standing?: string | undefined },
  kept: TakeKept,
  marked: (id: string) => boolean
): boolean {
  return homeHolds(kept) && (item.standing !== "set-aside" || marked(item.id))
}

/** No mark is safe: what a store the voice lane never told assumes. */
export const NONE_MARKED = (): boolean => false

/**
 * The item a new one makes room by letting go at `max`: the oldest by `at`
 * of those home holds (`held`), or null while there is room or home holds
 * none. The takes' and LeetType's answer notes' (`lib/leetype-takes`).
 *
 * **RM1: making room never drops what home lacks.**
 * - _Claim:_ at a store's cap, a new take or note is kept only once the
 *   letting go of the one `makesRoom` names was stored; when it was not, the
 *   keep ends `failed` and adds nothing, so the list's bound
 *   (`boundedList`, which slices past its limit) never drops another.
 * - _Family:_ every cap that makes room through `makesRoom` (the kit desk,
 *   `createTakes`; the pattern desk, `./pattern`; the scene notes,
 *   `lib/scene-voice`; LeetType's answer notes) × the letting go stored or
 *   refused × the new entry stored or refused.
 * - _Proof:_ each store's test "keeps nothing when the room it makes … is
 *   not stored (RM1)" (`__tests__/runtime.test.ts`, `__tests__/pattern.test.ts`,
 *   `lib/scene-voice/runtime.test.ts`); LeetType's notes refuse first
 *   (`phoneSpokenTakes().note`).
 */
export function makesRoom<T extends { readonly id: string }>(
  items: ReadonlyArray<T>,
  max: number,
  held: (id: string, item: T) => boolean,
  at: (item: T) => number
): T | null {
  if (items.length < max) return null
  let oldest: T | null = null
  for (const item of items) {
    if (held(item.id, item) && (oldest === null || at(item) < at(oldest))) {
      oldest = item
    }
  }
  return oldest
}

const takenAt = (take: Take): number => take.takenAt

/** The kit's take as the desk's port shows it. */
function viewOf(take: TakeKitView): TakeView {
  return take.kind === "recording"
    ? { kind: "recording", elapsedMs: take.elapsedMs }
    : take
}

export function createTakes(ports: TakesPorts, limits: TakeLimits): PhoneTakes {
  const listeners = new Set<() => void>()
  let last: KitTakeSnapshot["last"] = null
  let kept: KitTakeSnapshot["kept"] = null
  let playback: Playback | null = null
  // Bumped by every play, stop and reset: a read that lands after is stale.
  let playRequest = 0
  // Bumped by `reset`: a take started before it is not the new item's.
  let item = 0
  /** The item the take under way was started on. */
  let takingItem = 0
  // Reset hushes the last take's outcome, which was about the item before.
  let quiet = false

  const full = (): boolean => {
    const takes = ports.takes.read()
    return (
      takes.length >= limits.max &&
      makesRoom(takes, limits.max, ports.held, takenAt) === null
    )
  }

  /** Lets these takes go, with their audio; says whether the list stored it. */
  const letGo = (ids: ReadonlyArray<string>): boolean => {
    if (ids.length === 0) return true
    // The list first: audio whose entry stays would leave a silent take.
    const stored = ports.takes.remove(ids)
    if (stored) {
      if (last && ids.includes(last.id)) last = null
      // Ignored: audio no take names is cleared by the next sweep.
      ports.audio.remove(ids).catch(() => undefined)
    }
    publish()
    return stored
  }

  const kit = takeKit(
    {
      startRecording: ports.startRecording,
      now: ports.now,
      owner: ports.owner,
      deadlines: ports.deadlines,
      // The desk's sweep clears what a failed listing leaves.
      keep: (take, line, done) => {
        const id = ports.newId()
        const forItem = takingItem
        const durationMs = Math.round(take.durationMs)
        if (full()) {
          done({ outcome: "full" })
          return
        }
        const room = makesRoom(
          ports.takes.read(),
          limits.max,
          ports.held,
          takenAt
        )
        // RM1: a room not made keeps nothing, so the list never drops a
        // take at its cap to fit this one.
        if (room !== null && !letGo([room.id])) {
          done({ outcome: "failed" })
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
          (outcome) =>
            done(
              outcome === "kept"
                ? { outcome, id }
                : { outcome: outcome === "full" ? "full" : "failed" }
            )
        )
      },
    },
    { minMs: SOUNDBITE_MIN_MS, maxMs: limits.maxMs }
  )

  const snapshotOf = (): DeskSnapshot => {
    const { take, ended, blocked } = kit.getSnapshot()
    const atRest = take.kind === "idle"
    return {
      take: viewOf(take),
      // Why the microphone refuses is said whatever was hushed.
      said:
        atRest && ended !== null && (blocked !== null || !quiet)
          ? takeEndingSaid(TAKE_ENDING_WORDS, ended)
          : null,
      last,
      kept,
      playing: playback !== null,
      full: full(),
      ended:
        ended === null
          ? null
          : {
              seq: ended.seq,
              line: ended.answers,
              end: ended.ending,
              id: ended.id,
              unheard: ended.unheard,
            },
      blocked,
    }
  }
  let snapshot = snapshotOf()
  const publish = (): void => {
    snapshot = snapshotOf()
    for (const listener of listeners) listener()
  }
  kit.subscribe(publish)

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
      takingItem = item
      quiet = false
      kit.start(reading)
    },
    stop: (): void => {
      kit.stop()
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
    held: (id) => ports.held(id),
    reset: (): void => {
      item += 1
      kit.leave()
      stopPlayback()
      last = null
      quiet = true
      publish()
    },
  }
}
