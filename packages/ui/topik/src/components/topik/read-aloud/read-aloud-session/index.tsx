/**
 * The read-aloud drill on a phone (adaptive-learning canon Def. 4.8,
 * Cor. 4.6, Rem. 4.10): a start screen, sets that run hands-free one rep at
 * a time, a summary between sets, and the end of a sitting.
 *
 * Every screen shown during a sitting ends on its own clock within two
 * minutes (Rem. 4.10). The start screen and the end-of-sitting screen are
 * outside a sitting: nothing runs on them until the learner taps.
 *
 * Storage is the host's: the pace book, the practice record, the sentence
 * tally and an unfinished set come in as props and go out through callbacks,
 * so this screen keeps nothing between mounts.
 *
 * The mark beside the step label says whether the screen has shown the entry
 * before (adaptive-learning canon Rem. 7.5). On a sentence it opens what the
 * phone kept, and the drill holds while that is open.
 */

import type { JSX } from "react"
import { useState } from "react"
import { Button } from "@some-ui/shared"
import { StepLayout } from "@topik/components/topik/handheld/step-layout"
import { PoolNote } from "@topik/components/topik/read-aloud/pool-note"
import { HeldNote, RepCard } from "@topik/components/topik/read-aloud/rep-card"
import { SentenceFacts } from "@topik/components/topik/read-aloud/sentence-facts"
import { SessionHeader } from "@topik/components/topik/read-aloud/session-header"
import type { SetCardProps } from "@topik/components/topik/read-aloud/set-card"
import { SetCard } from "@topik/components/topik/read-aloud/set-card"
import type { UseReadAloudOptions } from "@topik/lib/topik/adapter/hooks/use-read-aloud"
import { useReadAloud } from "@topik/lib/topik/adapter/hooks/use-read-aloud"
import type { PracticeRecord } from "@topik/lib/topik/read-aloud/records"
import {
  levelShortfall,
  sentencePool,
} from "@topik/lib/topik/read-aloud/set-builder"
import type { Tally } from "@topik/lib/topik/read-aloud/tally"
import {
  markOf,
  rowOf,
  tallySince,
  tallySize,
} from "@topik/lib/topik/read-aloud/tally"
import { TALLY_WORDS } from "@topik/lib/topik/read-aloud/tally-words"
import { Pause, Play, X } from "lucide-react"

export type ReadAloudSessionProps = UseReadAloudOptions & {
  /** A phone on its side: stage and dock side by side. */
  short?: boolean
  /** The practice record to show on the start screen, and today's key. */
  record?: { record: PracticeRecord; today: string }
  /** The grammar-lens session's start, offered beside read-aloud's when given. */
  lens?: { available: boolean; full?: boolean; onStart: () => void }
  /** The sitting's two answers, asked for once the sitting is over. */
  feedback?: Extract<SetCardProps, { kind: "sitting-over" }>["feedback"]
  /**
   * What the phone keeps about each sentence shown, with the learner's local
   * day, whether the phone could keep it, and the way to clear it (whether it
   * did). Absent, the card carries no mark.
   */
  tally?: {
    rows: Tally
    today: string
    kept: boolean
    onClear: () => boolean
  }
  onExit: () => void
}

export const ReadAloudSession = ({
  short = false,
  record,
  lens,
  feedback,
  tally,
  onExit,
  ...options
}: ReadAloudSessionProps): JSX.Element => {
  const vm = useReadAloud(options)
  const { state, entry } = vm
  const { phase } = state
  // Whether opening the facts paused the drill, and so closing them resumes it.
  const [facts, setFacts] = useState<{ resume: boolean } | null>(null)
  // The sheet belongs to the pause it made: any other phase closes it.
  if (facts !== null && phase.name !== "paused") setFacts(null)
  const onEntry = entry !== undefined && vm.started
  const paused = phase.name === "paused"
  // Held by the page or the host's session, which resume it, not the learner.
  const held = phase.name === "paused" && phase.by !== "learner"
  const running =
    onEntry && phase.name !== "paused" && phase.name !== "sitting-over"
  const pool = sentencePool(options.deck, options.level, state.shown)
  const kind = tally && entry ? markOf(entry, tally.rows, state.paces) : null
  const row =
    tally && entry?.item.kind === "sentence"
      ? rowOf(tally.rows, entry.item.lineId)
      : null
  const since = tally ? tallySince(tally.rows) : null
  const openFacts = (): void => {
    setFacts({ resume: phase.name !== "paused" })
    if (phase.name !== "paused") vm.pause()
  }
  const closeFacts = (): void => {
    setFacts(null)
    if (facts?.resume) vm.resume()
  }

  const header = (
    <SessionHeader
      title="Read aloud"
      level={options.level}
      short={short}
      exit={{
        label: "Stop reading aloud",
        icon: <X className="size-6" />,
        onClick: onExit,
      }}
      trailing={
        (running || (paused && onEntry && !held)) && (
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
        )
      }
      progress={
        vm.started ? { done: state.cursor, of: state.queue.length } : null
      }
    />
  )

  const body = ((): JSX.Element | null => {
    if (!vm.started || vm.empty) {
      return (
        <SetCard
          kind="ready"
          level={options.level}
          audio={vm.audio}
          empty={vm.empty}
          shortfall={levelShortfall(options.deck, options.level)}
          resuming={(options.resume?.queue.length ?? 0) > 0}
          record={record}
          tally={
            tally && {
              size: tallySize(tally.rows),
              since,
              today: tally.today,
              onClear: tally.onClear,
            }
          }
          lens={lens}
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
          headline={`${state.counted} read aloud`}
          detail={pool.of > 0 ? <PoolNote pool={pool} /> : undefined}
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
          feedback={feedback}
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
            held ? (
              <HeldNote />
            ) : (
              <Button className="h-12 gap-2 rounded-2xl" onClick={vm.resume}>
                <Play className="size-5" /> Resume
              </Button>
            )
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
        pool={pool}
        exposure={
          kind === null
            ? undefined
            : { kind, onOpen: row === null ? undefined : openFacts }
        }
        short={short}
        onStuck={vm.stuck}
        onSkip={vm.skip}
        onResume={held ? undefined : vm.resume}
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
      {tally && entry && row && since && (
        <SentenceFacts
          open={facts !== null}
          row={row}
          why={TALLY_WORDS.why(entry.role, state.begun)}
          since={since}
          today={tally.today}
          kept={tally.kept}
          onClose={closeFacts}
        />
      )}
    </div>
  )
}
