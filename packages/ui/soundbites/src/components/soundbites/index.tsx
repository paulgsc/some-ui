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
 *
 * This component only renders and forwards taps. What happens, in what
 * order, and which late result still counts is `lib/machine.ts`; talking to
 * the microphone, the database and `Audio` is `lib/runtime.ts`. It owns one
 * runtime for as long as it is mounted, attached while it is
 * (docs/monorepo-boundaries.md, "Inside a React package").
 */
import type { JSX, ReactNode } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { cn } from "@some-ui/core-utils"
import { BrandMark, Button, TalkGlyph } from "@some-ui/shared"
import {
  describeContext,
  formatDuration,
  formatWhen,
} from "@soundbites/lib/format"
import type { Activity, SoundbiteSituation } from "@soundbites/lib/machine"
import { canUseKept } from "@soundbites/lib/machine"
import { phonePorts } from "@soundbites/lib/phone"
import {
  nextReplaced,
  SOUNDBITE_LIMIT,
  SOUNDBITE_MAX_MS,
} from "@soundbites/lib/policy"
import type { RecordingFailure } from "@soundbites/lib/recorder"
import type { SoundbitesPorts } from "@soundbites/lib/runtime"
import { createSoundbites } from "@soundbites/lib/runtime"
import type { Soundbite, SoundbiteSource } from "@soundbites/lib/types"
import { Pause, Play, Square, Trash2 } from "lucide-react"

export type SoundbitesProps = {
  /** Where the app stands. Read once, as each soundbite is kept. */
  situation: () => SoundbiteSituation
  /**
   * How the person got here. Read once, on mount: it stays with each take
   * until one is stored, so a retry after a failed save still records it.
   */
  source?: SoundbiteSource
  /**
   * Start talking on arrival: the person already tapped "say why" to get
   * here, so a second tap on this page would be one too many.
   */
  autoStart?: boolean
  /** Called as an auto-start begins, so the caller can forget the request. */
  onAutoStart?: () => void
  /** The phone's ports unless a test says otherwise. Read once, on mount. */
  ports?: Partial<SoundbitesPorts>
  /**
   * Below the list. `taking`: a take is opening, recording or not yet
   * stored, so what the store holds is about to change.
   */
  footer?: (taking: boolean) => ReactNode
}

/** Ideas to start a sentence with, for the moment the mind goes blank. */
const STARTERS = [
  "Too tired",
  "No time today",
  "Not in the mood",
  "Something came up",
  "Didn't know what to pick",
  "The app got in the way",
]

/**
 * What the page asks for. Every way in but "Talk now" and the wrap is about
 * a session that is not happening; "Talk now" (`capture`) is a comment on
 * anything and the wrap (`wrap`) a summary of a session just done, so they
 * ask for that, and the starters, which are all reasons, stay away.
 */
function askFor(source: SoundbiteSource): {
  title: string
  lede: string
  starters: boolean
} {
  if (source === "wrap") {
    return {
      title: "What stuck?",
      lede: "Say what you'll remember from this session, out loud, in a minute or less.",
      starters: false,
    }
  }
  return source === "capture"
    ? {
        title: "Talk now",
        lede: "Whatever is on your mind, out loud, in a minute or less.",
        starters: false,
      }
    : {
        title: "Not today?",
        lede: "Say why, out loud, in a minute or less. No typing, no wrong answers.",
        starters: true,
      }
}

const BLOCKED_COPY: Record<RecordingFailure, string> = {
  denied:
    "The microphone is off for Some UI. Turn it on under Android Settings → Apps → Some UI → Permissions → Microphone, then try again.",
  busy: "Another app is using the microphone. Try again once it lets go.",
  unsupported: "This phone's web view can't record audio.",
  failed: "The microphone didn't start. Try again.",
}

/** The last stretch of a take, when the fill warns that time is nearly up. */
const WARN_MS = 10_000

/** What the big button does when pressed, for a screen reader. */
const RECORD_LABELS: Record<Activity["kind"], string> = {
  idle: "Start talking",
  playing: "Start talking",
  opening: "Opening the microphone",
  recording: "Done, keep it",
  saving: "Keeping it",
}

const RecordButton = ({
  activity,
  onPress,
}: {
  activity: Activity
  onPress: () => void
}): JSX.Element => {
  const recording = activity.kind === "recording"
  const elapsed = recording ? activity.elapsed : 0
  const level = recording ? activity.level : 0
  const busy = activity.kind === "opening" || activity.kind === "saving"
  const progress = recording ? Math.min(1, elapsed / SOUNDBITE_MAX_MS) : 0
  const warning = recording && SOUNDBITE_MAX_MS - elapsed <= WARN_MS

  const label = RECORD_LABELS[activity.kind]

  return (
    <button
      type="button"
      onClick={onPress}
      disabled={busy}
      aria-label={label}
      aria-pressed={recording}
      className={cn(
        "relative mx-auto flex size-44 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-full shadow-lg transition-[transform,background-color] duration-100 [@media(max-height:479px)]:size-36",
        "focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
        "disabled:opacity-70",
        recording
          ? "bg-muted text-foreground"
          : "bg-brand text-brand-foreground active:scale-95"
      )}
      // The input level breathes the button while it listens: proof the
      // microphone hears, without a word on screen.
      style={recording ? { transform: `scale(${1 + level * 0.12})` } : {}}
    >
      {/* The take fills the button from the bottom as the minute runs, in
          place of a ring traced round an empty band. */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-0 bottom-0 transition-[height] duration-100",
          warning ? "bg-warning" : "bg-destructive"
        )}
        style={{ height: `${progress * 100}%` }}
      />
      {recording ? (
        // On its own chip, so it reads over the fill at any height.
        <span className="bg-background text-foreground relative flex flex-col items-center gap-1 rounded-2xl px-4 py-2">
          <Square className="size-7 fill-current" aria-hidden="true" />
          <span className="text-sm font-semibold tabular-nums">
            {formatDuration(SOUNDBITE_MAX_MS - elapsed)} left
          </span>
        </span>
      ) : (
        <>
          <TalkGlyph
            className={cn("size-10", busy && "motion-safe:animate-pulse")}
          />
          <span className="text-base font-bold">
            {busy ? "…" : "Tap to talk"}
          </span>
        </>
      )}
    </button>
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
        "bg-card border-border/50 flex items-center gap-3 rounded-2xl border p-3",
        isNextReplaced && "border-warning/60 bg-warning/5"
      )}
    >
      <Button
        size="icon"
        className="bg-brand text-brand-foreground hover:bg-brand/85 size-11 shrink-0 rounded-full"
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
            <p className="text-xs font-medium text-warning">
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
  situation,
  source = "direct",
  autoStart = false,
  onAutoStart,
  ports,
  footer,
}: SoundbitesProps): JSX.Element => {
  // The runtime owns the microphone and the store for this mount, so it is
  // made once, from the props it arrived with. A new arrival is a new mount:
  // the host keys this component by its request (www: `useArrivalKey`).
  // What the page shows reads the runtime's state, never these props again.
  /* eslint-disable owner-guard/no-mount-snapshot -- the runtime is created once per mount and the host remounts on a new arrival (see above) */
  const [runtime] = useState(() =>
    createSoundbites(
      { ...phonePorts(), ...ports },
      { source, autoStart, onAutoStart }
    )
  )
  /* eslint-enable owner-guard/no-mount-snapshot */
  useEffect(() => runtime.attach(), [runtime])
  useEffect(() => runtime.setSituation(situation))
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
  const { activity, library, choice, notice, blocked } = state
  const { dispatch } = runtime

  const now = new Date()
  // What the page asks for follows the runtime's way in, not the prop: the
  // route clears `?say=` as soon as listening starts, which must not turn
  // "Talk now" back into "Not today?", and the runtime alone knows when a
  // stored take has made the next one "direct".
  const ask = askFor(state.source)
  const recording = activity.kind === "recording"
  const usable = canUseKept(activity)
  const kept = library.kind === "read" ? library.kept : null
  const full = kept !== null && kept.length >= SOUNDBITE_LIMIT
  const replaced = kept === null ? null : nextReplaced(kept, choice)
  const playingId = activity.kind === "playing" ? activity.id : null

  const remove = (bite: Soundbite, when: string): void => {
    if (window.confirm(`Delete the soundbite from ${when}?`))
      dispatch({ type: "deleteConfirmed", id: bite.id })
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 pb-8">
      {/* A phone held sideways (under 480px tall: the height half of the
          `handheld` variant in @some-ui/styles) has no room to stack the
          header over the button, and stacked, "Throw it away" fell below
          the fold mid-take. There they sit side by side instead. */}
      <div className="flex flex-col gap-6 [@media(max-height:479px)]:flex-row [@media(max-height:479px)]:items-center [@media(max-height:479px)]:gap-8">
        <header className="space-y-1 text-center [@media(max-height:479px)]:flex-1 [@media(max-height:479px)]:text-left">
          <h1 className="text-2xl font-semibold tracking-tight">{ask.title}</h1>
          <p className="text-muted-foreground text-sm">{ask.lede}</p>
        </header>

        <div className="flex flex-col items-center gap-3">
          <RecordButton
            activity={activity}
            onPress={() => dispatch({ type: "recordPressed" })}
          />
          {recording ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => dispatch({ type: "discardPressed" })}
            >
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

      {blocked !== null && activity.kind === "idle" && (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 space-y-3 rounded-lg border p-4 text-sm"
        >
          <p>{BLOCKED_COPY[blocked]}</p>
          {blocked !== "unsupported" && (
            <Button
              size="sm"
              onClick={() => dispatch({ type: "recordPressed" })}
            >
              Try again
            </Button>
          )}
        </div>
      )}

      {ask.starters && (
        <section aria-label="If you're stuck" className="space-y-2">
          <p className="text-muted-foreground text-center text-xs">
            Stuck? Start with one of these and keep going.
          </p>
          <ul className="flex flex-wrap justify-center gap-2">
            {STARTERS.map((starter) => (
              <li
                key={starter}
                className="bg-card border-border/50 rounded-full border px-3.5 py-1.5 text-sm font-medium shadow-sm"
              >
                {starter}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="kept-soundbites" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="kept-soundbites" className="text-base font-semibold">
            On this phone
          </h2>
          {/* Only a count that was read: before a read succeeds (or when
              it failed) there is no number to show, and 0 would say empty. */}
          {/* Said in words, not a row of slots: six little holes waiting
              to be filled was the look this screen is moving away from. */}
          {kept !== null && (
            <span className="bg-brand/30 text-brand-foreground dark:text-brand rounded-full px-3 py-0.5 text-xs font-bold tabular-nums">
              {kept.length} of {SOUNDBITE_LIMIT} kept
            </span>
          )}
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

        {library.kind === "unreadable" ? (
          <div
            role="alert"
            className="bg-muted/60 space-y-3 rounded-2xl p-4 text-center text-sm"
          >
            <p className="text-muted-foreground">
              Couldn&apos;t read what&apos;s on this phone. If it is full, your
              next one replaces the oldest.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => dispatch({ type: "retryRead" })}
            >
              Read them again
            </Button>
          </div>
        ) : kept === null ? null : kept.length === 0 ? (
          <p className="bg-card border-border/50 text-muted-foreground flex items-center gap-3 rounded-2xl border p-4 text-sm font-medium">
            <BrandMark tone="brand" className="size-9 shrink-0" />
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
                  disabled={!usable}
                  onPlay={() => dispatch({ type: "playPressed", id: bite.id })}
                  onReplaceInstead={() =>
                    dispatch({ type: "replacePicked", id: bite.id })
                  }
                  onDelete={() => remove(bite, when)}
                />
              )
            })}
          </ul>
        )}
      </section>
      {footer?.(
        activity.kind === "opening" ||
          activity.kind === "recording" ||
          activity.kind === "saving"
      )}
    </div>
  )
}
