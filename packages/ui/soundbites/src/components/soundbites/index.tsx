/**
 * "Not today? Say why": one tap starts the microphone, a second keeps what
 * was said. Nothing to fill in, nothing to confirm, no step between opening
 * the page and talking. The app notes the when and the around-what itself
 * (`SoundbiteContext`), so the person only ever supplies the why.
 *
 * The take is the take pattern's (`@some-ui/voice-capture`), with the
 * page's options (`SOUNDBITE_TAKES` in `lib/policy`): its button, counting
 * down the minute, and its rows, each with Play, Redo and Let it go. Let it
 * go sets a soundbite aside (D3): out of the list, still kept, so it asks
 * nothing first. The page's own extras sit in the pattern's slots: what the
 * app noted, under each row's length, and "Replace this one next instead",
 * in the row's `extra`.
 *
 * Bounded twice: a take stops itself at `SOUNDBITE_MAX_MS`, and the phone
 * keeps `SOUNDBITE_LIMIT`. Once full, the next one replaces the one
 * `lib/policy` picks, or one the person marks instead, a choice made
 * before, during or never.
 *
 * A take in progress is kept, not lost, when it is cut short from outside:
 * the screen turning off, the app going to the background, or the page being
 * left. What was said up to then is the soundbite.
 *
 * This component only renders and forwards taps. What happens, in what
 * order, and which late result still counts is `lib/machine.ts` and the
 * take pattern; talking to the microphone, the database and `Audio` is
 * `lib/runtime.ts`. It owns one
 * runtime for as long as it is mounted, attached while it is
 * (docs/monorepo-boundaries.md, "Inside a React package").
 */
import type { JSX, ReactNode } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import {
  BrandMark,
  Button,
  TakeButton,
  TakeRows,
  useTakePattern,
} from "@some-ui/shared"
import type { TakeRowView } from "@some-ui/voice-capture"
import { TAKE_WORDS, takeItemView, takeSaid } from "@some-ui/voice-capture"
import { describeContext, formatWhen } from "@soundbites/lib/format"
import { homeHeld, homeHoldsNow } from "@soundbites/lib/home-held"
import type { SoundbiteSituation } from "@soundbites/lib/machine"
import { phonePorts } from "@soundbites/lib/phone"
import {
  nextReplaced,
  patternTakes,
  SOUNDBITE_ITEM,
  SOUNDBITE_LIMIT,
} from "@soundbites/lib/policy"
import type { SoundbitesPorts } from "@soundbites/lib/runtime"
import { createSoundbites } from "@soundbites/lib/runtime"
import type { SoundbiteSource } from "@soundbites/lib/types"
import { replacedBy, SOUNDBITE_WORDS as WORDS } from "@soundbites/lib/words"

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
 * What the page asks for. Every way in but "Talk now" is about a session
 * that is not happening; "Talk now" (`capture`) is a comment on anything, so
 * it asks for that, and the starters, which are all reasons, stay away.
 */
function askFor(source: SoundbiteSource): {
  title: string
  lede: string
  starters: boolean
} {
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
  // Read so what home holds, said again, renders the offer again.
  useSyncExternalStore(homeHeld.subscribe, homeHeld.getSnapshot)
  const { library, choice, notice } = state
  const { dispatch, pattern } = runtime
  const take = useTakePattern(pattern)

  const now = new Date()
  // What the page asks for follows the runtime's way in, not the prop: the
  // route clears `?say=` as soon as listening starts, which must not turn
  // "Talk now" back into "Not today?", and the runtime alone knows when a
  // stored take has made the next one "direct".
  const ask = askFor(state.source)
  const kept = library.kind === "read" ? library.kept : null
  const full = kept !== null && kept.length >= SOUNDBITE_LIMIT
  // One reading of what home holds for this render, not one per soundbite.
  const held = homeHoldsNow()
  const replaced = kept === null ? null : nextReplaced(kept, choice, held)
  const bites = new Map((kept ?? []).map((bite) => [bite.id, bite]))
  const view = takeItemView(
    take,
    patternTakes(kept ?? [], held),
    SOUNDBITE_ITEM,
    pattern.options
  )
  const said = view.said === null ? null : takeSaid(TAKE_WORDS, view.said)

  /** What the app noted, under a row's length. */
  const describe = ({ id }: { id: string }): ReactNode => {
    const bite = bites.get(id)
    if (bite === undefined) return undefined
    return `${formatWhen(bite.recordedAt, now)} · ${describeContext(bite.context, bite.recordedAt)}`
  }

  /** The row's extra (the pattern's slot): which one the next replaces. */
  const replaceNext = (row: TakeRowView): ReactNode => {
    const { id } = row.take
    if (!full || !held(id)) return undefined
    if (replaced?.id === id)
      return (
        <span className="text-warning px-2 text-xs font-medium">
          Replaced by your next one
        </span>
      )
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-muted-foreground"
        onClick={() => dispatch({ type: "replacePicked", id })}
      >
        Replace this one next instead
      </Button>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 pb-8">
      {/* A phone held sideways (under 480px tall: the height half of the
          `handheld` variant in @some-ui/styles) has no room to stack the
          header over the button, so there they sit side by side. */}
      <div className="flex flex-col gap-6 [@media(max-height:479px)]:flex-row [@media(max-height:479px)]:items-center [@media(max-height:479px)]:gap-8">
        <header className="space-y-1 text-center [@media(max-height:479px)]:flex-1 [@media(max-height:479px)]:text-left">
          <h1 className="text-2xl font-semibold tracking-tight">{ask.title}</h1>
          <p className="text-muted-foreground text-sm">{ask.lede}</p>
        </header>

        <div className="flex flex-col items-center gap-3">
          <TakeButton
            view={view.button}
            size="large"
            onTap={() => pattern.tap(SOUNDBITE_ITEM, view.supersedes)}
          />
          <p
            aria-live="polite"
            data-take-ended={
              view.said?.kind === "ended" ? view.said.ended.seq : undefined
            }
            className="text-muted-foreground min-h-5 text-center text-sm"
          >
            {said}
          </p>
          {notice !== "" && (
            <p role="alert" className="text-destructive text-center text-sm">
              {notice}
            </p>
          )}
        </div>
      </div>

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
              it failed) there is no number to show, and 0 would say empty.
              Set aside and earlier ones are kept too, so they count. */}
          {kept !== null && (
            <span className="bg-brand text-brand-foreground rounded-full px-3 py-0.5 text-xs font-bold tabular-nums">
              {kept.length} of {SOUNDBITE_LIMIT} kept
            </span>
          )}
        </div>

        {full && replaced !== null && (
          <p className="text-muted-foreground text-xs">
            {WORDS.fullReplaces}{" "}
            <span className="text-foreground font-medium">
              {formatWhen(replaced.recordedAt, now)}
            </span>
            {WORDS.whichGoes[replacedBy(replaced, choice)]}
            {WORDS.pickAnother}
          </p>
        )}

        {full && replaced === null && (
          <p className="text-muted-foreground text-xs">{WORDS.fullNoneHeld}</p>
        )}

        {library.kind === "unreadable" ? (
          <div
            role="alert"
            className="bg-muted/40 space-y-3 rounded-2xl p-4 text-center text-sm"
          >
            <p className="text-muted-foreground">{WORDS.unreadable}</p>
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
          <TakeRows
            view={view}
            onPlay={pattern.play}
            onRedo={(id) => pattern.tap(SOUNDBITE_ITEM, id)}
            onLetGo={pattern.letGo}
            describe={describe}
            extra={replaceNext}
          />
        )}
      </section>
      {footer?.(take.take.kind !== "idle")}
    </div>
  )
}
