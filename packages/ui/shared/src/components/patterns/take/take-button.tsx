import type { JSX } from "react"
import { assertNever } from "@some-ui/core-utils"
import type { TakeButtonView } from "@some-ui/voice-capture"
import { buttonLabel, buttonSaid, TAKE_WORDS } from "@some-ui/voice-capture"
import { cva, type VariantProps } from "class-variance-authority"
import { Square } from "lucide-react"

import { cn } from "../../../lib/utils"
import { TalkGlyph } from "../../icons/tool-glyphs"

/**
 * The take button's sizes: `large` is the page's one control (Soundbites'
 * round button), `compact` sits in a card or a line among others.
 */
const takeButtonVariants = cva(
  [
    "relative flex items-center justify-center overflow-hidden rounded-full shadow-md transition-[transform,background-color] duration-100",
    "focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
    "disabled:opacity-70",
  ],
  {
    variants: {
      size: {
        large:
          "mx-auto size-44 flex-col gap-1.5 [@media(max-height:479px)]:size-36",
        compact: "min-h-12 w-full max-w-xs gap-2 px-5 py-2",
      },
      tone: {
        rest: "bg-brand text-brand-foreground active:scale-95",
        live: "bg-destructive/15 text-foreground ring-destructive ring-[3px] ring-inset",
        quiet: "bg-muted text-muted-foreground shadow-none",
      },
    },
    defaultVariants: { size: "compact", tone: "rest" },
  }
)

export type TakeButtonProps = {
  /** What the button is for this item: `takeItemView(...).button`. */
  view: TakeButtonView
  /** D1: a tap starts a take, or stops the one under way. */
  onTap: () => void
  className?: string
} & Pick<VariantProps<typeof takeButtonVariants>, "size">

function toneOf(view: TakeButtonView): "rest" | "live" | "quiet" {
  switch (view.kind) {
    case "opening":
    case "recording":
    case "keeping": {
      return "live"
    }
    case "elsewhere":
    case "full": {
      return "quiet"
    }
    case "ready": {
      return "rest"
    }
    default: {
      return assertNever(view)
    }
  }
}

/**
 * The take pattern's button: tap to start, tap to stop (D1).
 * While it records it shows the time against the cap (or the time left,
 * under the options' `clock: "left"`), breathes with the input's level, and
 * warns when the time is nearly up; while the microphone
 * opens it can still be tapped, which lets the take go. Its words are the
 * pattern's (`TAKE_WORDS`); it renders `view` and forwards taps, nothing
 * else.
 */
export const TakeButton = ({
  view,
  onTap,
  size,
  className,
}: TakeButtonProps): JSX.Element => {
  const words = TAKE_WORDS
  const recording = view.kind === "recording" ? view : null
  const progress = recording
    ? Math.min(1, recording.elapsedMs / Math.max(1, recording.capMs))
    : 0
  const tappable =
    view.kind === "ready" ||
    view.kind === "opening" ||
    view.kind === "recording"
  const large = size === "large"
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={!tappable}
      aria-label={buttonLabel(words, view)}
      aria-pressed={view.kind === "opening" || view.kind === "recording"}
      data-take={view.kind}
      className={cn(
        takeButtonVariants({ size, tone: toneOf(view) }),
        className
      )}
      // The input level breathes the button while it listens: proof the
      // microphone hears, without a word on screen.
      style={
        recording ? { transform: `scale(${1 + recording.level * 0.08})` } : {}
      }
    >
      {recording && (
        // The take fills the button as the cap nears.
        <span
          aria-hidden
          className={cn(
            "absolute transition-[height,width] duration-100",
            large ? "inset-x-0 bottom-0" : "inset-y-0 left-0",
            recording.nearlyUp ? "bg-warning" : "bg-destructive/40"
          )}
          style={
            large
              ? { height: `${progress * 100}%` }
              : { width: `${progress * 100}%` }
          }
        />
      )}
      {recording ? (
        // On its own chip, so it reads over the fill at any height.
        <span
          className={cn(
            "bg-background text-foreground relative flex items-center gap-2 rounded-2xl px-3 py-1",
            large && "flex-col gap-1 px-4 py-2"
          )}
        >
          <Square
            className={cn("fill-current", large ? "size-7" : "size-4")}
            aria-hidden="true"
          />
          <span className="text-sm font-semibold tabular-nums">
            {recording.clock === "left"
              ? words.left(recording.capMs - recording.elapsedMs)
              : words.elapsed(recording.elapsedMs, recording.capMs)}
          </span>
          {/* A countdown already says how little is left. */}
          {recording.nearlyUp && recording.clock === "elapsed" && (
            <span className="text-xs font-medium">
              {words.nearlyUp(recording.capMs - recording.elapsedMs)}
            </span>
          )}
        </span>
      ) : (
        <>
          <TalkGlyph
            className={cn(
              large ? "size-10" : "size-5 shrink-0",
              (view.kind === "opening" || view.kind === "keeping") &&
                "motion-safe:animate-pulse"
            )}
          />
          <span
            className={cn(
              "relative",
              large
                ? "px-4 text-center text-base font-bold"
                : "text-sm font-semibold"
            )}
          >
            {buttonSaid(words, view)}
          </span>
        </>
      )}
    </button>
  )
}

export { takeButtonVariants }
