/**
 * The read-aloud drill on a phone (adaptive-learning canon Def. 4.8,
 * Cor. 4.6, Rem. 4.10): a start screen, sets that run hands-free one rep at
 * a time, a summary between sets, and the end of a sitting.
 *
 * Every screen shown during a sitting ends on its own clock within two
 * minutes (Rem. 4.10). The start screen and the end-of-sitting screen are
 * outside a sitting: nothing runs on them until the learner taps.
 *
 * Storage is the host's: the pace book, the practice record and an
 * unfinished set come in as props and go out through callbacks, so this
 * screen keeps nothing between mounts.
 */

import type { JSX } from "react"
import { Button } from "@some-ui/shared"
import { StepLayout } from "@topik/components/topik/handheld/step-layout"
import { RepCard } from "@topik/components/topik/read-aloud/rep-card"
import { SetCard } from "@topik/components/topik/read-aloud/set-card"
import type { UseReadAloudOptions } from "@topik/lib/topik/adapter/hooks/use-read-aloud"
import { useReadAloud } from "@topik/lib/topik/adapter/hooks/use-read-aloud"
import type { PracticeRecord } from "@topik/lib/topik/read-aloud/records"
import { Pause, Play, X } from "lucide-react"
import { cn } from "some-ui-utils"

export type ReadAloudSessionProps = UseReadAloudOptions & {
  /** A phone on its side: stage and dock side by side. */
  short?: boolean
  /** The practice record to show on the start screen, and today's key. */
  record?: { record: PracticeRecord; today: string }
  onExit: () => void
}

export const ReadAloudSession = ({
  short = false,
  record,
  onExit,
  ...options
}: ReadAloudSessionProps): JSX.Element => {
  const vm = useReadAloud(options)
  const { state, entry } = vm
  const { phase } = state
  const onEntry = entry !== undefined && vm.started
  const paused = phase.name === "paused"
  const running =
    onEntry && phase.name !== "paused" && phase.name !== "sitting-over"

  const header = (
    <header className="shrink-0">
      <div
        className={cn("flex items-center gap-2 px-2", short ? "h-11" : "h-14")}
      >
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          onClick={onExit}
          aria-label="Stop reading aloud"
        >
          <X className="size-6" />
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold">
          Read aloud
        </h1>
        {(running || (paused && onEntry)) && (
          <Button
            variant="ghost"
            size="icon"
            className="size-11 shrink-0"
            onClick={paused ? vm.resume : vm.pause}
            aria-label={paused ? "Resume" : "Pause"}
          >
            {paused ? (
              <Play className="size-6" />
            ) : (
              <Pause className="size-6" />
            )}
          </Button>
        )}
      </div>
      {vm.started && state.queue.length > 0 && (
        <div
          role="progressbar"
          aria-label="Progress through this set"
          aria-valuemin={0}
          aria-valuemax={state.queue.length}
          aria-valuenow={Math.min(state.cursor, state.queue.length)}
          className="bg-muted h-1 w-full"
        >
          <div
            className="bg-primary h-full rounded-r-full transition-[width] duration-300"
            style={{
              width: `${(Math.min(state.cursor, state.queue.length) / state.queue.length) * 100}%`,
            }}
          />
        </div>
      )}
    </header>
  )

  const body = ((): JSX.Element | null => {
    if (!vm.started || vm.empty) {
      return (
        <SetCard
          kind="ready"
          level={options.level}
          audio={vm.audio}
          empty={vm.empty}
          resuming={(options.resume?.queue.length ?? 0) > 0}
          record={record}
          short={short}
          onStart={vm.begin}
          onStop={onExit}
        />
      )
    }
    if (phase.name === "summary") {
      return (
        <SetCard
          kind="summary"
          counted={state.counted}
          runKey={state.seq}
          short={short}
          onNext={vm.nextSet}
          onStop={onExit}
        />
      )
    }
    if (phase.name === "sitting-over") {
      return (
        <SetCard
          kind="sitting-over"
          short={short}
          onContinue={vm.startSitting}
          onStop={onExit}
        />
      )
    }
    if (phase.name === "idle") return null
    if (!entry) {
      // Paused on the summary: the only thing to do is carry on.
      return (
        <StepLayout
          short={short}
          stage={<p className="text-muted-foreground text-sm">Paused</p>}
          dock={
            <Button className="h-12 gap-2 rounded-2xl" onClick={vm.resume}>
              <Play className="size-5" /> Resume
            </Button>
          }
        />
      )
    }
    return (
      <RepCard
        deck={options.deck}
        entry={entry}
        step={phase.name === "paused" ? "paused" : phase.name}
        stepMs={vm.step?.seq === state.seq ? vm.step.ms : null}
        stepKey={state.seq}
        reported={state.reported}
        playing={vm.playing === state.seq}
        short={short}
        onStuck={vm.stuck}
        onSkip={vm.skip}
        onResume={vm.resume}
      />
    )
  })()

  return (
    <div
      data-slot="read-aloud-session"
      data-short={short || undefined}
      className="flex size-full min-h-0 flex-col"
    >
      {header}
      {body}
    </div>
  )
}
