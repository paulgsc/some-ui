/**
 * The grammar-lens session on a phone (adaptive-learning canon Cor. 4.8):
 * sets of lens items, each closed by its summary. It starts from
 * read-aloud's start screen and holds none of read-aloud's sets.
 */

import type { JSX } from "react"
import { useSyncExternalStore } from "react"
import type { TakePatternSnapshot } from "@some-ui/voice-capture"
import { takeItemView } from "@some-ui/voice-capture"
import { StepLayout } from "@topik/components/topik/handheld/step-layout"
import { LensCard } from "@topik/components/topik/read-aloud/lens-card"
import { HeldNote } from "@topik/components/topik/read-aloud/rep-card"
import { SessionHeader } from "@topik/components/topik/read-aloud/session-header"
import { SetCard } from "@topik/components/topik/read-aloud/set-card"
import type { UseLensSessionOptions } from "@topik/lib/topik/adapter/hooks/use-lens-session"
import { useLensSession } from "@topik/lib/topik/adapter/hooks/use-lens-session"
import type { LensTakeSnapshot } from "@topik/lib/topik/adapter/lens-takes"
import {
  currentItem,
  currentOutcome,
  lensSummary,
} from "@topik/lib/topik/read-aloud/lens/machine"
import { MISTAKES } from "@topik/lib/topik/read-aloud/mistakes"
import { ArrowLeft } from "lucide-react"

const noSubscription = (): (() => void) => () => undefined
const noTake = (): LensTakeSnapshot | null => null
const noPattern = (): TakePatternSnapshot | null => null

export type LensSessionProps = UseLensSessionOptions & {
  short?: boolean
  /** The record keeps no new entry until it is shared (Rem. 4.18). */
  recordFull?: () => boolean
  /** What leaving returns to: read-aloud's start screen, unless said. */
  exitLabel?: string
}

/** The set's tally under its headline, by catalogue entry. */
const SummaryDetail = ({
  summary,
  full,
}: {
  summary: ReturnType<typeof lensSummary>
  full: boolean
}): JSX.Element => {
  return (
    <div
      data-slot="lens-summary"
      className="flex w-full flex-col gap-2 text-left"
    >
      <ul className="flex flex-col gap-2">
        {summary.entries.map((entry) => (
          <li
            key={entry.mistake}
            className="border-border flex flex-col gap-0.5 rounded-xl border px-3 py-2"
          >
            <span className="flex items-baseline justify-between gap-2 font-semibold">
              {MISTAKES[entry.mistake].name}
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {entry.right} right · {entry.wrong} missed
              </span>
            </span>
            <span className="text-muted-foreground text-sm">
              {MISTAKES[entry.mistake].rule}
            </span>
          </li>
        ))}
      </ul>
      {summary.asWritten.answered > 0 && (
        <p className="text-muted-foreground text-sm">
          Right as written: {summary.asWritten.right} of{" "}
          {summary.asWritten.answered}
        </p>
      )}
      {full && (
        <p className="text-warning text-sm">
          The record is full and keeps no new answers until a home this phone is
          paired with has the ones on it.
        </p>
      )}
    </div>
  )
}

export const LensSession = ({
  short = false,
  recordFull,
  exitLabel = "Back to read-aloud",
  ...options
}: LensSessionProps): JSX.Element => {
  const vm = useLensSession(options)
  const { state } = vm
  const { phase } = state
  // A hidden page keeps the card it paused mounted, for when it is shown.
  const showing = phase.name === "paused" ? phase.resume : phase
  const item = currentItem(state)
  const { takes } = options
  const kept = useSyncExternalStore(
    takes?.subscribe ?? noSubscription,
    takes?.getSnapshot ?? noTake
  )
  const pattern = useSyncExternalStore(
    takes?.pattern.subscribe ?? noSubscription,
    takes?.pattern.getSnapshot ?? noPattern
  )

  const header = (
    <SessionHeader
      title="Grammar lens"
      level={options.level}
      short={short}
      exit={{
        label: exitLabel,
        icon: <ArrowLeft className="size-6" />,
        onClick: options.onExit,
      }}
      progress={{ done: state.cursor, of: state.items.length }}
    />
  )

  const body = ((): JSX.Element | null => {
    if (phase.name === "paused" && phase.by === "session") {
      return (
        <StepLayout
          short={short}
          stage={<p className="text-muted-foreground text-sm">Paused</p>}
          dock={<HeldNote />}
        />
      )
    }
    if (showing.name === "summary") {
      const summary = lensSummary(state)
      return (
        <SetCard
          kind="summary"
          headline={`${summary.right} of ${summary.answered} right`}
          detail={
            <SummaryDetail summary={summary} full={recordFull?.() ?? false} />
          }
          // The summary waits out its two minutes and then ends the session;
          // nothing counts down (Cor. 4.8).
          runKey={null}
          short={short}
          onNext={vm.nextSet}
          onStop={options.onExit}
        />
      )
    }
    if (showing.name === "sitting-over") {
      return (
        <SetCard
          kind="sitting-over"
          note="Keep going picks up where this sitting stopped. A set you leave is not picked up again."
          short={short}
          onContinue={vm.startSitting}
          onStop={options.onExit}
        />
      )
    }
    if (showing.name === "idle" || !item) return null
    return (
      <LensCard
        key={`${item.key}:${state.cursor}`}
        item={item}
        phase={showing}
        outcome={currentOutcome(state)}
        audio={vm.audio}
        cueRead={vm.cueRead}
        playing={vm.playing}
        short={short}
        last={state.cursor === state.items.length - 1}
        onAnswer={vm.answer}
        onProbe={vm.probe}
        onSkipProbes={vm.skipProbes}
        onSituation={vm.situation}
        onNext={vm.next}
        onHearCue={vm.hearCue}
        onHearLine={vm.hearLine}
        take={
          takes && kept && pattern
            ? {
                view: takeItemView(
                  pattern,
                  kept.takes,
                  item.lineId,
                  takes.pattern.options
                ),
                taking: pattern.take.kind !== "idle",
                full: kept.full,
                onTap: () => vm.tapTake(),
                onRedo: vm.tapTake,
                onPlay: vm.playTake,
                onLetGo: takes.pattern.letGo,
              }
            : undefined
        }
      />
    )
  })()

  return (
    <div
      data-slot="lens-session"
      data-short={short || undefined}
      className="flex size-full min-h-0 flex-col"
    >
      {header}
      {body}
    </div>
  )
}
