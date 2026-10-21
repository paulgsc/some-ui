import type { JSX, ReactNode } from "react"
import { useEffect, useState } from "react"
import { Button } from "@some-ui/shared"
import { StepLayout } from "@topik/components/topik/handheld/step-layout"
import { PracticeRecordView } from "@topik/components/topik/read-aloud/practice-record"
import type { ReadAloudLevel } from "@topik/lib/topik/read-aloud/content"
import type { PracticeRecord } from "@topik/lib/topik/read-aloud/records"
import { SUMMARY_MS } from "@topik/lib/topik/read-aloud/timing"
import { BookOpenText, Play, ScanSearch, VolumeX } from "lucide-react"

export type SetCardProps = { short: boolean; onStop: () => void } & (
  | {
      kind: "ready"
      level: ReadAloudLevel
      /** False where no speech is supported: the drill is not offered. */
      audio: boolean
      /** An unfinished set is waiting from an earlier sitting. */
      resuming: boolean
      /** The deck has nothing at or below this level to draw a set from. */
      empty?: boolean
      /** `levelShortfall`'s result for the deck at this level. */
      shortfall: number | null
      /** The practice record and the learner's local day, where one is kept. */
      record?: { record: PracticeRecord; today: string }
      /**
       * The grammar-lens session, a start of its own (Cor. 4.8), where the
       * host offers it, whether any line at or below this level has
       * something for it to ask, and whether its record keeps no new answers
       * (Rem. 4.18).
       */
      lens?: { available: boolean; full?: boolean; onStart: () => void }
      onStart: () => void
    }
  | {
      kind: "summary"
      /** What the set came to, in a line. */
      headline: string
      /** More of it, below the headline; the summary then scrolls. */
      detail?: ReactNode
      /**
       * Restarts the countdown to the next set when it changes; null shows
       * none, for a summary that does not move on by itself.
       */
      runKey: number | null
      onNext: () => void
    }
  | {
      kind: "sitting-over"
      /** What waits for the next sitting; read-aloud's set when absent. */
      note?: string
      onContinue: () => void
    }
)

/** Whole seconds left of `ms`, counted down from when `runKey` last changed. */
function useCountdown(ms: number, runKey: number): number {
  const [tick, setTick] = useState({ runKey, elapsed: 0 })
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((prev) => ({
        runKey,
        elapsed: prev.runKey === runKey ? prev.elapsed + 1000 : 1000,
      }))
    }, 1000)
    return (): void => clearInterval(timer)
  }, [runKey])
  const elapsed = tick.runKey === runKey ? tick.elapsed : 0
  return Math.max(0, Math.ceil((ms - elapsed) / 1000))
}

const Summary = ({
  headline,
  detail,
  runKey,
  short,
  onNext,
  onStop,
}: {
  headline: string
  detail: ReactNode
  runKey: number | null
  short: boolean
  onNext: () => void
  onStop: () => void
}): JSX.Element => {
  const seconds = useCountdown(SUMMARY_MS, runKey ?? 0)
  return (
    <StepLayout
      short={short}
      longForm={detail !== undefined}
      stage={
        <div
          data-slot="read-aloud-summary"
          className="mx-auto my-auto flex w-full max-w-sm flex-col items-center gap-2 text-center"
        >
          <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            Set done
          </span>
          <p className="text-2xl font-semibold">{headline}</p>
          {detail}
        </div>
      }
      dock={
        <>
          <Button className="h-12 gap-2 rounded-2xl" onClick={onNext}>
            Next set{" "}
            {runKey !== null && (
              <span className="tabular-nums opacity-70">{seconds}</span>
            )}
          </Button>
          <Button variant="ghost" className="h-12 rounded-2xl" onClick={onStop}>
            Stop
          </Button>
        </>
      }
    />
  )
}

/**
 * The screens around the sets: the start, each set's summary, and the end of
 * a sitting (adaptive-learning canon Def. 4.8, Rem. 4.10).
 *
 * The summary shows how many reps ran to the end, and nothing that improves
 * when a stuck report is withheld: no rate, no pace, no list of what came
 * back (Prop. 6.4 (ii), (iii)). It closes itself when its countdown runs
 * out, so the sets run on hands-free.
 */
export const SetCard = (props: SetCardProps): JSX.Element => {
  const { short, onStop } = props

  if (props.kind === "summary") {
    return (
      <Summary
        headline={props.headline}
        detail={props.detail}
        runKey={props.runKey}
        short={short}
        onNext={props.onNext}
        onStop={onStop}
      />
    )
  }

  if (props.kind === "sitting-over") {
    return (
      <StepLayout
        short={short}
        stage={
          <div
            data-slot="read-aloud-sitting-over"
            className="flex max-w-sm flex-col items-center gap-2 text-center"
          >
            <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              Thirty minutes
            </span>
            <p className="text-2xl font-semibold">That&apos;s a sitting.</p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {props.note ??
                "Your set is kept. It picks up at its next item whenever you come back, now included."}
            </p>
          </div>
        }
        dock={
          <>
            <Button
              className="h-12 gap-2 rounded-2xl"
              onClick={props.onContinue}
            >
              <Play className="size-5" /> Keep going
            </Button>
            <Button
              variant="ghost"
              className="h-12 rounded-2xl"
              onClick={onStop}
            >
              Done for now
            </Button>
          </>
        }
      />
    )
  }

  return (
    <StepLayout
      short={short}
      // With the record, the start screen is taller than a phone on its
      // side; it scrolls rather than clip.
      longForm={props.record !== undefined}
      stage={
        <div
          data-slot="read-aloud-ready"
          className="mx-auto flex max-w-sm flex-col items-center gap-3 text-center"
        >
          {!short && (
            <div className="bg-primary/10 text-primary flex size-16 items-center justify-center rounded-full">
              {props.audio ? (
                <BookOpenText className="size-8" />
              ) : (
                <VolumeX className="size-8" />
              )}
            </div>
          )}
          <p className="text-2xl font-semibold">Read aloud</p>
          {props.audio && props.shortfall !== null && (
            <p
              data-slot="read-aloud-shortfall"
              className="text-muted-foreground text-sm leading-relaxed"
            >
              {props.shortfall === 0
                ? `Nothing is written for TOPIK ${props.level} yet, so each set comes from lower levels.`
                : `Only ${props.shortfall} ${props.shortfall === 1 ? "sentence is" : "sentences are"} written for TOPIK ${props.level} yet, so each set fills up with easier ones.`}
            </p>
          )}
          {props.empty ? (
            <p className="text-muted-foreground text-sm leading-relaxed">
              There is nothing at this level to read yet. Choose a lower level,
              or load more lines.
            </p>
          ) : props.audio ? (
            <p className="text-muted-foreground text-sm leading-relaxed">
              Read each word or sentence aloud before you hear it, then say it
              again. It runs by itself; tap Stuck when one won&apos;t come.
            </p>
          ) : (
            <p className="text-muted-foreground text-sm leading-relaxed">
              Read-aloud plays every item after you read it, and this device has
              no voice to play it with.
            </p>
          )}
          {props.lens && (
            <p
              data-slot="read-aloud-lens-about"
              className="text-muted-foreground text-sm leading-relaxed"
            >
              {props.lens.available
                ? "Grammar lens: spot the form a learner gets wrong, one line at a time. Nothing counts down."
                : "Grammar lens needs lines written with likely mistakes, and this set has none at this level yet."}
            </p>
          )}
          {props.lens?.available && props.lens.full && (
            <p className="text-warning text-sm leading-relaxed">
              The grammar-lens record is full and keeps no new answers. Share
              your study context with an agent to make room.
            </p>
          )}
          {props.record && (
            <PracticeRecordView
              record={props.record.record}
              today={props.record.today}
            />
          )}
        </div>
      }
      dock={
        <>
          {props.audio && !props.empty && (
            <Button className="h-12 gap-2 rounded-2xl" onClick={props.onStart}>
              <Play className="size-5" />{" "}
              {props.resuming ? "Continue reading aloud" : "Read aloud"}
            </Button>
          )}
          {props.lens?.available && (
            <Button
              variant="secondary"
              className="h-12 gap-2 rounded-2xl"
              onClick={props.lens.onStart}
            >
              <ScanSearch className="size-5" /> Grammar lens
            </Button>
          )}
          <Button variant="ghost" className="h-12 rounded-2xl" onClick={onStop}>
            Back
          </Button>
        </>
      }
    />
  )
}
