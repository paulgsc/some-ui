/**
 * "Not today? Say why": one tap starts the microphone, a second keeps what
 * was said. Nothing to fill in, nothing to confirm, no step between opening
 * the page and talking. The app notes the when and the around-what itself
 * (`SoundbiteContext`), so the person only ever supplies the why.
 *
 * Bounded twice: a take stops itself at `SOUNDBITE_MAX_MS`, and the phone
 * keeps `SOUNDBITE_LIMIT`. Being full never blocks a recording either: the
 * next one replaces the oldest, or whichever the person marks instead, and
 * that choice can be made before, during or never.
 *
 * A take in progress is kept, not lost, when it is cut short from outside:
 * the screen turning off, the app going to the background, or the page being
 * left. What was said up to then is the soundbite.
 */
import type { JSX } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@some-ui/shared"
import {
  describeContext,
  formatDuration,
  formatWhen,
} from "@soundbites/lib/format"
import {
  byNewest,
  nextReplaced,
  SOUNDBITE_LIMIT,
  SOUNDBITE_MAX_MS,
  SOUNDBITE_MIN_MS,
} from "@soundbites/lib/policy"
import type {
  Recording,
  RecordingFailure,
  StartRecording,
} from "@soundbites/lib/recorder"
import { RecordingError, startMicRecording } from "@soundbites/lib/recorder"
import type { SoundbiteStore } from "@soundbites/lib/store"
import { indexedDbSoundbiteStore } from "@soundbites/lib/store"
import type { Soundbite, SoundbiteContext } from "@soundbites/lib/types"
import { Mic, Pause, Play, Square, Trash2 } from "lucide-react"
import { cn } from "some-ui-utils"

export type SoundbitesProps = {
  /** What the app knows right now. Read once, as each soundbite is kept. */
  context: () => SoundbiteContext
  /**
   * Start talking on arrival: the person already tapped "say why" to get
   * here, so a second tap on this page would be one too many.
   */
  autoStart?: boolean
  /** Called as an auto-start begins, so the caller can forget the request. */
  onAutoStart?: () => void
  /**
   * Called once a soundbite is safely stored, and not before: a save that
   * fails leaves whatever `context` depends on as it was, for the retry.
   */
  onKept?: () => void
  /** Where soundbites are kept. The phone's IndexedDB unless a test says. */
  store?: SoundbiteStore
  startRecording?: StartRecording
}

type Phase =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "recording"; startedAt: number }
  | { kind: "saving" }
  | { kind: "blocked"; reason: RecordingFailure }

/** Ideas to start a sentence with, for the moment the mind goes blank. */
const STARTERS = [
  "Too tired",
  "No time today",
  "Not in the mood",
  "Something came up",
  "Didn't know what to pick",
  "The app got in the way",
]

const BLOCKED_COPY: Record<RecordingFailure, string> = {
  denied:
    "The microphone is off for Some UI. Turn it on under Android Settings → Apps → Some UI → Permissions → Microphone, then try again.",
  busy: "Another app is using the microphone. Try again once it lets go.",
  unsupported: "This phone's web view can't record audio.",
  failed: "The microphone didn't start. Try again.",
}

/** One store per page load, so the database opens once. */
let defaultStore: SoundbiteStore | null = null
function phoneStore(): SoundbiteStore {
  defaultStore ??= indexedDbSoundbiteStore()
  return defaultStore
}

const RING_RADIUS = 46
const RING_LENGTH = 2 * Math.PI * RING_RADIUS
/** The last stretch of a take, when the ring warns that time is nearly up. */
const WARN_MS = 10_000

/** What the big button does when pressed, for a screen reader. */
const RECORD_LABELS: Record<Phase["kind"], string> = {
  idle: "Start talking",
  blocked: "Start talking",
  starting: "Opening the microphone",
  recording: "Done, keep it",
  saving: "Keeping it",
}

const RecordButton = ({
  phase,
  elapsed,
  level,
  onPress,
}: {
  phase: Phase
  elapsed: number
  level: number
  onPress: () => void
}): JSX.Element => {
  const recording = phase.kind === "recording"
  const busy = phase.kind === "starting" || phase.kind === "saving"
  const progress = recording ? Math.min(1, elapsed / SOUNDBITE_MAX_MS) : 0
  const warning = recording && SOUNDBITE_MAX_MS - elapsed <= WARN_MS

  const label = RECORD_LABELS[phase.kind]

  return (
    <div className="relative mx-auto size-44 [@media(max-height:479px)]:size-36">
      <svg
        className="absolute inset-0 size-full -rotate-90"
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        <circle
          cx="50"
          cy="50"
          r={RING_RADIUS}
          className="stroke-muted fill-none"
          strokeWidth="4"
        />
        <circle
          cx="50"
          cy="50"
          r={RING_RADIUS}
          className={cn(
            "fill-none transition-[stroke-dashoffset] duration-100",
            warning ? "stroke-amber-500" : "stroke-destructive"
          )}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH * (1 - progress)}
        />
      </svg>
      <button
        type="button"
        onClick={onPress}
        disabled={busy}
        aria-label={label}
        aria-pressed={recording}
        className={cn(
          "absolute inset-4 flex flex-col items-center justify-center gap-1 rounded-full shadow-lg transition-[transform,background-color] duration-100",
          "focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
          "disabled:opacity-70",
          // White, not `text-destructive-foreground`: some session themes
          // set that to a grey that all but vanishes on the red.
          recording
            ? "bg-destructive text-white"
            : "bg-primary text-primary-foreground active:scale-95"
        )}
        // The input level breathes the button while it listens: proof the
        // microphone hears, without a word on screen.
        style={recording ? { transform: `scale(${1 + level * 0.12})` } : {}}
      >
        {recording ? (
          <>
            <Square className="size-8 fill-current" aria-hidden="true" />
            <span className="text-sm font-medium tabular-nums">
              {formatDuration(SOUNDBITE_MAX_MS - elapsed)} left
            </span>
          </>
        ) : (
          <>
            <Mic
              className={cn("size-10", busy && "motion-safe:animate-pulse")}
              aria-hidden="true"
            />
            <span className="text-sm font-medium">
              {busy ? "…" : "Tap to talk"}
            </span>
          </>
        )}
      </button>
    </div>
  )
}

const KeptSoundbite = ({
  bite,
  now,
  full,
  isNextReplaced,
  playing,
  disabled,
  onPlay,
  onReplaceInstead,
  onDelete,
}: {
  bite: Soundbite
  now: Date
  full: boolean
  isNextReplaced: boolean
  playing: boolean
  disabled: boolean
  onPlay: () => void
  onReplaceInstead: () => void
  onDelete: () => void
}): JSX.Element => {
  const when = formatWhen(bite.recordedAt, now)
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3",
        isNextReplaced && "border-amber-500/60 bg-amber-500/5"
      )}
    >
      <Button
        size="icon"
        variant="outline"
        className="shrink-0 rounded-full"
        onClick={onPlay}
        disabled={disabled}
        aria-label={playing ? `Stop playing ${when}` : `Play ${when}`}
      >
        {playing ? (
          <Pause className="size-4" aria-hidden="true" />
        ) : (
          <Play className="size-4" aria-hidden="true" />
        )}
      </Button>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {when}{" "}
          <span className="text-muted-foreground tabular-nums">
            · {formatDuration(bite.durationMs)}
          </span>
        </p>
        <p className="text-muted-foreground truncate text-xs">
          {describeContext(bite.context, bite.recordedAt)}
        </p>
        {full &&
          (isNextReplaced ? (
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
              Replaced by your next one
            </p>
          ) : (
            <button
              type="button"
              onClick={onReplaceInstead}
              className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
            >
              Replace this one next instead
            </button>
          ))}
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="text-muted-foreground hover:text-destructive shrink-0"
        onClick={onDelete}
        disabled={disabled}
        aria-label={`Delete ${when}`}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    </li>
  )
}

export const Soundbites = ({
  context,
  autoStart = false,
  onAutoStart,
  onKept,
  store: givenStore,
  startRecording = startMicRecording,
}: SoundbitesProps): JSX.Element => {
  const store = givenStore ?? phoneStore()
  const [kept, setKept] = useState<Array<Soundbite> | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: "idle" })
  const [elapsed, setElapsed] = useState(0)
  const [level, setLevel] = useState(0)
  const [notice, setNotice] = useState("")
  const [choice, setChoice] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)

  // Refs, not state, for what the handlers below must see at once: a second
  // tap before React re-renders must not open the microphone twice.
  const recordingRef = useRef<Recording | null>(null)
  const busyRef = useRef(false)
  const choiceRef = useRef(choice)
  const contextRef = useRef(context)
  const onKeptRef = useRef(onKept)
  useEffect(() => {
    choiceRef.current = choice
    contextRef.current = context
    onKeptRef.current = onKept
  })
  const playerRef = useRef<{ audio: HTMLAudioElement; url: string } | null>(
    null
  )
  const mountedRef = useRef(true)

  useEffect(() => {
    let live = true
    store.list().then(
      (all) => {
        if (live) setKept(byNewest(all))
      },
      () => {
        if (live) setKept([])
      }
    )
    return (): void => {
      live = false
    }
  }, [store])

  const stopPlaying = useCallback((): void => {
    const player = playerRef.current
    if (player === null) return
    player.audio.pause()
    URL.revokeObjectURL(player.url)
    playerRef.current = null
    setPlayingId(null)
  }, [])

  const start = useCallback(async (): Promise<void> => {
    if (busyRef.current) return
    busyRef.current = true
    stopPlaying()
    setNotice("")
    setPhase({ kind: "starting" })
    try {
      const recording = await startRecording()
      // The page was left while the microphone was opening: let it go.
      if (!mountedRef.current) {
        recording.discard()
        return
      }
      recordingRef.current = recording
      setElapsed(0)
      setPhase({ kind: "recording", startedAt: Date.now() })
    } catch (error) {
      busyRef.current = false
      setPhase({
        kind: "blocked",
        reason: error instanceof RecordingError ? error.reason : "failed",
      })
    }
  }, [startRecording, stopPlaying])

  const finish = useCallback(async (): Promise<void> => {
    const recording = recordingRef.current
    if (recording === null) return
    recordingRef.current = null
    setPhase({ kind: "saving" })
    try {
      const take = await recording.finish()
      if (take.durationMs < SOUNDBITE_MIN_MS || take.blob.size === 0) {
        setNotice("Too short to keep. Tap, talk, then tap again.")
        return
      }
      const bite: Soundbite = {
        id: crypto.randomUUID(),
        recordedAt: new Date().toISOString(),
        durationMs: Math.min(take.durationMs, SOUNDBITE_MAX_MS),
        mimeType: take.mimeType,
        bytes: take.blob.size,
        context: contextRef.current(),
      }
      await store.save(bite, take.blob, choiceRef.current)
      onKeptRef.current?.()
      setChoice(null)
      const after = byNewest(await store.list())
      setKept(after)
      setNotice(
        `Kept, ${formatDuration(bite.durationMs)}. ${after.length} of ${SOUNDBITE_LIMIT} on this phone.`
      )
    } catch {
      setNotice("That one couldn't be kept. Try again?")
    } finally {
      busyRef.current = false
      setPhase({ kind: "idle" })
    }
  }, [store])

  const discard = (): void => {
    recordingRef.current?.discard()
    recordingRef.current = null
    busyRef.current = false
    setPhase({ kind: "idle" })
    setNotice("Thrown away. Nothing kept.")
  }

  // The clock and the level meter, and the one-minute stop.
  const startedAt = phase.kind === "recording" ? phase.startedAt : null
  useEffect(() => {
    if (startedAt === null) return
    const tick = setInterval(() => {
      const ms = Date.now() - startedAt
      setElapsed(Math.min(ms, SOUNDBITE_MAX_MS))
      setLevel(recordingRef.current?.level() ?? 0)
      if (ms >= SOUNDBITE_MAX_MS) void finish()
    }, 100)
    return (): void => clearInterval(tick)
  }, [startedAt, finish])

  // Keep what was said when the phone takes the screen away mid-sentence.
  useEffect(() => {
    if (startedAt === null) return
    const onHidden = (): void => {
      if (document.visibilityState === "hidden") void finish()
    }
    document.addEventListener("visibilitychange", onHidden)
    return (): void =>
      document.removeEventListener("visibilitychange", onHidden)
  }, [startedAt, finish])

  // ... and when the page is left. `finish` only touches the store after
  // this point; the setters it calls are no-ops on an unmounted component.
  useEffect(() => {
    mountedRef.current = true
    return (): void => {
      mountedRef.current = false
      void finish()
      stopPlaying()
    }
  }, [finish, stopPlaying])

  const autoStarted = useRef(false)
  useEffect(() => {
    if (!autoStart || autoStarted.current) return
    autoStarted.current = true
    onAutoStart?.()
    void start()
  }, [autoStart, onAutoStart, start])

  const play = async (bite: Soundbite): Promise<void> => {
    const wasPlaying = playingId === bite.id
    stopPlaying()
    if (wasPlaying) return
    const blob = await store.audio(bite.id)
    if (blob === null) {
      setNotice("That recording's audio is missing.")
      return
    }
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    playerRef.current = { audio, url }
    setPlayingId(bite.id)
    audio.onended = stopPlaying
    audio.play().catch(stopPlaying)
  }

  const remove = async (bite: Soundbite, when: string): Promise<void> => {
    if (!window.confirm(`Delete the soundbite from ${when}?`)) return
    if (playingId === bite.id) stopPlaying()
    await store.remove(bite.id)
    if (choice === bite.id) setChoice(null)
    setKept(byNewest(await store.list()))
  }

  const now = new Date()
  const recording = phase.kind === "recording"
  const full = kept !== null && kept.length >= SOUNDBITE_LIMIT
  const replaced = kept === null ? null : nextReplaced(kept, choice)

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 pb-8">
      {/* A phone held sideways (under 480px tall: the height half of the
          `handheld` variant in @some-ui/styles) has no room to stack the
          header over the button, and stacked, "Throw it away" fell below
          the fold mid-take. There they sit side by side instead. */}
      <div className="flex flex-col gap-6 [@media(max-height:479px)]:flex-row [@media(max-height:479px)]:items-center [@media(max-height:479px)]:gap-8">
        <header className="space-y-1 text-center [@media(max-height:479px)]:flex-1 [@media(max-height:479px)]:text-left">
          <h1 className="text-2xl font-semibold tracking-tight">Not today?</h1>
          <p className="text-muted-foreground text-sm">
            Say why, out loud, in a minute or less. No typing, no wrong answers.
          </p>
        </header>

        <div className="flex flex-col items-center gap-3">
          <RecordButton
            phase={phase}
            elapsed={elapsed}
            level={level}
            onPress={() => void (recording ? finish() : start())}
          />
          {recording ? (
            <Button variant="ghost" size="sm" onClick={discard}>
              Throw it away
            </Button>
          ) : (
            // Holds the line the button above takes while recording, so the
            // page does not jump when a take starts.
            <div className="h-9" aria-hidden="true" />
          )}
          <p
            aria-live="polite"
            className="text-muted-foreground min-h-5 text-center text-sm"
          >
            {notice}
          </p>
        </div>
      </div>

      {phase.kind === "blocked" && (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 space-y-3 rounded-lg border p-4 text-sm"
        >
          <p>{BLOCKED_COPY[phase.reason]}</p>
          {phase.reason !== "unsupported" && (
            <Button size="sm" onClick={() => void start()}>
              Try again
            </Button>
          )}
        </div>
      )}

      <section aria-label="If you're stuck" className="space-y-2">
        <p className="text-muted-foreground text-center text-xs">
          Stuck? Start with one of these and keep going.
        </p>
        <ul className="flex flex-wrap justify-center gap-1.5">
          {STARTERS.map((starter) => (
            <li
              key={starter}
              className="bg-muted text-muted-foreground rounded-full px-3 py-1 text-xs"
            >
              {starter}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="kept-soundbites" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="kept-soundbites" className="text-base font-semibold">
            On this phone
          </h2>
          <div
            className="flex items-center gap-1"
            role="img"
            aria-label={`${kept?.length ?? 0} of ${SOUNDBITE_LIMIT} kept`}
          >
            {Array.from({ length: SOUNDBITE_LIMIT }, (_, slot) => (
              <span
                key={slot}
                className={cn(
                  "size-2 rounded-full",
                  slot < (kept?.length ?? 0) ? "bg-primary" : "bg-muted"
                )}
              />
            ))}
            <span className="text-muted-foreground ml-1.5 text-xs tabular-nums">
              {kept?.length ?? 0}/{SOUNDBITE_LIMIT}
            </span>
          </div>
        </div>

        {full && replaced !== null && (
          <p className="text-muted-foreground text-xs">
            Full. Your next one replaces{" "}
            <span className="text-foreground font-medium">
              {formatWhen(replaced.recordedAt, now)}
            </span>
            {choice === null ? ", the oldest" : ""}. Pick another below to
            replace that one instead.
          </p>
        )}

        {kept === null ? null : kept.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
            Nothing kept yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {kept.map((bite) => {
              const when = formatWhen(bite.recordedAt, now)
              return (
                <KeptSoundbite
                  key={bite.id}
                  bite={bite}
                  now={now}
                  full={full}
                  isNextReplaced={replaced?.id === bite.id}
                  playing={playingId === bite.id}
                  disabled={recording}
                  onPlay={() => void play(bite)}
                  onReplaceInstead={() => setChoice(bite.id)}
                  onDelete={() => void remove(bite, when)}
                />
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
