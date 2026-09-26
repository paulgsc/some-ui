import type { JSX, PointerEvent } from "react"
import { useRef } from "react"
import { Button } from "@some-ui/shared"
import { StepLayout } from "@topik/components/topik/handheld/step-layout"
import type { Message } from "@topik/lib/topik"
import type { RevealLevel } from "@topik/lib/topik/core/lesson-track"
import {
  ChevronLeft,
  ChevronRight,
  Ear,
  Eye,
  Languages,
  Volume2,
} from "lucide-react"
import { cn } from "some-ui-utils"

type LineCardProps = {
  message: Message
  reveal: RevealLevel
  /** Highest rung allowed now; 1 while this line's checks are pending. */
  cap: RevealLevel
  audio: boolean
  speaking: boolean
  canGoBack: boolean
  short: boolean
  onReveal: () => void
  onReplay: () => void
  onNext: () => void
  onPrev: () => void
}

/** Horizontal travel, in px, that reads as a swipe rather than a tap. */
const SWIPE_DISTANCE = 56

/**
 * One line of the conversation, climbing the ladder audio -> Hangul -> gloss
 * (adaptive-learning canon Cor. 4.4, *Line*).
 *
 * Tapping the stage climbs a rung; a horizontal swipe moves between lines.
 * Every gesture also has a button in the dock - a gesture is a shortcut, never
 * the only way.
 */
export const LineCard = ({
  message,
  reveal,
  cap,
  audio,
  speaking,
  canGoBack,
  short,
  onReveal,
  onReplay,
  onNext,
  onPrev,
}: LineCardProps): JSX.Element => {
  const start = useRef<{ x: number; y: number } | null>(null)
  const korean = message.korean || message.content
  const canReveal = reveal < cap

  const onPointerDown = (event: PointerEvent): void => {
    start.current = { x: event.clientX, y: event.clientY }
  }
  const onPointerUp = (event: PointerEvent): void => {
    const origin = start.current
    start.current = null
    if (!origin) return
    const dx = event.clientX - origin.x
    const dy = event.clientY - origin.y
    if (Math.abs(dx) >= SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) onNext()
      else if (canGoBack) onPrev()
      return
    }
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && canReveal) onReveal()
  }

  const nextRung =
    reveal === 0 ? (
      <>
        <Eye className="size-4" /> Show Korean
      </>
    ) : (
      <>
        <Languages className="size-4" /> Show English
      </>
    )

  const stage = (
    <div
      data-slot="topik-line"
      data-reveal={reveal}
      className="flex w-full max-w-md touch-pan-y flex-col items-center gap-4 text-center select-none"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (start.current = null)}
    >
      <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
        {message.role === "user" ? "You" : "Speaker"}
      </span>

      {reveal === 0 ? (
        <div className="flex flex-col items-center gap-3">
          <div
            className={cn(
              "bg-primary/10 text-primary flex size-20 items-center justify-center rounded-full",
              speaking && "animate-pulse"
            )}
          >
            <Ear className="size-9" />
          </div>
          <p className="text-muted-foreground text-sm">
            Listen first. Tap when you want to see it.
          </p>
        </div>
      ) : (
        <p
          lang="ko"
          className={cn(
            "text-foreground font-semibold break-keep",
            short ? "text-xl leading-snug" : "text-2xl leading-relaxed"
          )}
        >
          {korean}
        </p>
      )}

      {reveal === 2 && (
        <p className="text-muted-foreground text-base leading-relaxed">
          {message.english}
        </p>
      )}

      {reveal >= 1 && reveal === cap && cap < 2 && (
        <p className="text-muted-foreground text-xs">
          English unlocks after the question about this line.
        </p>
      )}
    </div>
  )

  const dock = (
    <>
      <div className="flex gap-2">
        {audio && (
          <Button
            variant="secondary"
            className="h-12 min-w-0 flex-1 gap-2"
            onClick={onReplay}
            aria-label="Play line"
          >
            <Volume2 className={cn("size-5", speaking && "animate-pulse")} />
            {reveal === 0 ? "Listen" : "Again"}
          </Button>
        )}
        {canReveal && (
          <Button
            variant="outline"
            className="h-12 min-w-0 flex-1 gap-2"
            onClick={onReveal}
          >
            {nextRung}
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          className="h-12 px-3"
          onClick={onPrev}
          disabled={!canGoBack}
          aria-label="Previous line"
        >
          <ChevronLeft className="size-5" />
        </Button>
        <Button className="h-12 min-w-0 flex-1 gap-2" onClick={onNext}>
          Next <ChevronRight className="size-5" />
        </Button>
      </div>
    </>
  )

  return <StepLayout short={short} stage={stage} dock={dock} />
}
