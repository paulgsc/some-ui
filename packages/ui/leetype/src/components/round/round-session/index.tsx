import type { FC } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArtifactSwitcher } from "@leetype/components/round/artifact-switcher"
import type {
  ArtifactId,
  SwitchableArtifact,
} from "@leetype/components/round/artifact-switcher"
import { BudgetDisplay } from "@leetype/components/round/budget-display"
import { ConstraintDiff } from "@leetype/components/round/constraint-diff"
import { DiffSetChoices } from "@leetype/components/round/diff-set-choices"
import { GenerateRound } from "@leetype/components/round/generate-round"
import { RoundChoices } from "@leetype/components/round/round-choices"
import { RoundFeedback } from "@leetype/components/round/round-feedback"
import { RoundOutcome } from "@leetype/components/round/round-outcome"
import { SourcePanel } from "@leetype/components/round/source-panel"
import { shuffledBySeed } from "@leetype/lib/leetype/deterministic-random"
import { buildRoundPrompt } from "@leetype/lib/leetype/generation"
import type { PastedRoundStore } from "@leetype/lib/leetype/pasted-round"
import { createPastedRoundStore } from "@leetype/lib/leetype/pasted-round"
import type { AssembledRound } from "@leetype/lib/leetype/round-assembly"
import {
  assembleRound,
  lintAuthoredRounds,
} from "@leetype/lib/leetype/round-assembly"
import type { RoundCycleState } from "@leetype/lib/leetype/round-cycle"
import { nextRoundCycleState } from "@leetype/lib/leetype/round-cycle"
import {
  ROUND_PROBE_PROMPT,
  roundProbeOf,
} from "@leetype/lib/leetype/round-probe"
import type { Round } from "@leetype/types/authored-round"
import type { Commitment } from "@leetype/types/commitment"
import { Button } from "@some-ui/shared"
import { Sparkles } from "lucide-react"
import { cn } from "some-ui-utils"

/** Decorrelates consecutive rounds' seeds; the same stride `ReadingSession` uses per step. */
const ROUND_SEED_STRIDE = 0x9e3779b9

type RoundSessionProps = {
  /**
   * The rounds to draw from: the served corpus in `server` mode, the
   * bundled one otherwise (`Leetype` decides). A round that fails
   * `lintAuthoredRounds` is skipped rather than played.
   */
  rounds: ReadonlyArray<Round>
  /** Session term supplied by the composer/scene, in milliseconds. */
  sessionDurationMs?: number
  /** Deterministic override for tests, previews, and replaying an ordering bug. */
  sessionSeed?: number
  /** Fired once, when the term is spent. */
  onSessionComplete?: () => void
  /** Where the learner's own round is held; `sessionStorage` unless a test passes one. */
  pastedStore?: PastedRoundStore
  className?: string
}

type Play = {
  readonly round: Round
  readonly assembled: AssembledRound
  /** Whether this is the learner's own round rather than the corpus's. */
  readonly own: boolean
  readonly seed: number
}

type Progress = {
  /** Index into the play's presentation order, once a diff is chosen. */
  readonly picked: number | null
  /** The cycle's state after `(d, p)`, once the proposition is committed. */
  readonly outcome: Exclude<
    RoundCycleState,
    { phase: "posingDiffSelection" }
  > | null
}

const FRESH: Progress = { picked: null, outcome: null }

/** Rounds that pass the authored-round lint and open on a diff selection. */
function playable(rounds: ReadonlyArray<Round>): Array<Round> {
  return rounds.filter((round) => {
    if (lintAuthoredRounds([round]).length > 0) return false
    try {
      return assembleRound(round).initialState.phase === "posingDiffSelection"
    } catch {
      return false
    }
  })
}

/**
 * The phone's round surface (#1440, the Leetype cutover): one round at a
 * time, one artifact at a time (`ArtifactSwitcher`, Def. 9.2 / Rem. 9.2),
 * driven by `lib/leetype/round-cycle`.
 *
 * ```text
 * A, C → C′, B, D        the round opens inadmissible at C′ (Def. 8.1 case 2)
 * pick d                 DiffSetChoices, one-shot
 * name p                 RoundChoices, one-shot; verdict p = μ(d) (Thm. 6.1)
 * next state             RoundOutcome: fits, a rescue question, or an explanation question
 * ```
 *
 * # What this surface never shows
 *
 * No completion fraction, no "k of N", no end of the corpus (Prop. 8.1):
 * rounds cycle for as long as the session term lasts, and only the term
 * ends it. Progress is unconditional (Ax. 9.1): "Next round" is available
 * the moment `(d, p)` is committed, right or wrong. No run result either:
 * a round is complete without `r` (Rem. 8.0), and execution is
 * `paulgsc/server#381`'s to add.
 *
 * # Variety
 *
 * The corpus is shuffled by the session seed, so two sessions see rounds
 * in different orders, the way `ReadingSession` varied exercises through
 * `SESSION_EXERCISE_IDS`. Within a round, `D`'s presentation order is
 * shuffled by the round's own seed, so position never says which diff is
 * admissible (the corpus authors it first).
 *
 * # The learner's own round
 *
 * "Make your own round" opens `GenerateRound`. A round it accepts plays
 * next, is held for the session (`lib/leetype/pasted-round`), and plays
 * first again after a reload. Its id is namespaced so it can never be
 * confused with a corpus round of the same name.
 */
export const RoundSession: FC<RoundSessionProps> = ({
  rounds,
  sessionDurationMs = 10 * 60_000,
  sessionSeed,
  onSessionComplete,
  pastedStore,
  className,
}) => {
  const [seed] = useState(
    () => sessionSeed ?? crypto.getRandomValues(new Uint32Array(1))[0]!
  )
  const [store] = useState(() => pastedStore ?? createPastedRoundStore())
  const queue = useMemo(
    () => shuffledBySeed(playable(rounds), seed),
    [rounds, seed]
  )

  /** Rounds played so far this session, own rounds included; also the seed stride. */
  const [played, setPlayed] = useState(0)
  /** Position in `queue`, advanced only by corpus rounds. */
  const [position, setPosition] = useState(0)
  const [own, setOwn] = useState<Round | null>(() => store.get())
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState<Progress>(FRESH)
  const [recent, setRecent] = useState<ReadonlyArray<string>>([])

  const [finished, setFinished] = useState(false)
  const [sessionClockMs, setSessionClockMs] = useState(0)
  const [sessionGeneration, setSessionGeneration] = useState(0)
  const onSessionCompleteRef = useRef(onSessionComplete)
  useEffect(() => {
    onSessionCompleteRef.current = onSessionComplete
  }, [onSessionComplete])

  useEffect(() => {
    // Anchored at mount, for the reason `ReadingSession`'s clock is: the
    // orchestrator removes this scene at its own `start_time + duration`.
    const startedAt = performance.now()
    const update = (): void => {
      setSessionClockMs(
        Math.min(performance.now() - startedAt, sessionDurationMs)
      )
    }
    update()
    const timer = window.setInterval(update, 250)
    return (): void => window.clearInterval(timer)
  }, [sessionDurationMs, sessionGeneration])

  useEffect(() => {
    if (finished || sessionClockMs < sessionDurationMs) return
    // The term running out is an external fact the orchestrator's clock
    // owns, the same shape and justification as `ReadingSession`'s own
    // end-of-session effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFinished(true)
    onSessionCompleteRef.current?.()
  }, [finished, sessionClockMs, sessionDurationMs])

  const play = useMemo((): Play | null => {
    const roundSeed = (seed ^ Math.imul(played + 1, ROUND_SEED_STRIDE)) >>> 0
    const round = own ?? queue[position % Math.max(queue.length, 1)]
    if (round === undefined) return null
    try {
      return {
        round,
        assembled: assembleRound(round),
        own: own !== null,
        seed: roundSeed,
      }
    } catch {
      return null
    }
  }, [own, queue, position, played, seed])

  const order = useMemo(
    () =>
      play === null
        ? []
        : shuffledBySeed(
            play.assembled.diffOptions.map((_, index) => index),
            play.seed
          ),
    [play]
  )
  const presented = useMemo(
    () =>
      play === null
        ? []
        : order.map((index) => play.assembled.diffOptions[index]!),
    [play, order]
  )
  const pickedOption =
    progress.picked === null ? undefined : presented[progress.picked]
  const probe = useMemo(
    () =>
      pickedOption === undefined || play === null
        ? null
        : roundProbeOf(pickedOption.member, play.seed),
    [pickedOption, play]
  )

  const handleCommit = useCallback(
    (commitment: Commitment): void => {
      if (play === null || pickedOption === undefined) return
      const initial = play.assembled.initialState
      if (initial.phase !== "posingDiffSelection") return
      setProgress((current) => ({
        ...current,
        outcome: nextRoundCycleState(initial, {
          kind: "selectDiff",
          diff: pickedOption,
          commitment,
        }),
      }))
    },
    [play, pickedOption]
  )

  const handleNext = useCallback((): void => {
    if (play !== null) {
      setRecent((ids) => [play.round.id, ...ids].slice(0, 5))
    }
    if (own !== null) {
      setOwn(null)
    } else {
      setPosition((current) => current + 1)
    }
    setPlayed((count) => count + 1)
    setProgress(FRESH)
  }, [own, play])

  const handleOwnRound = useCallback(
    (round: Round): void => {
      store.set(round)
      setOwn(round)
      setGenerating(false)
      setProgress(FRESH)
    },
    [store]
  )

  const handleRestart = useCallback((): void => {
    setFinished(false)
    setSessionClockMs(0)
    setSessionGeneration((generation) => generation + 1)
    setProgress(FRESH)
  }, [])

  if (finished) {
    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center gap-4 px-4 text-center",
          className
        )}
      >
        <div>
          <p className="text-base font-medium text-foreground">
            Session complete
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {played} {played === 1 ? "round" : "rounds"} played
          </p>
        </div>
        <Button onClick={handleRestart} size="lg">
          Restart
        </Button>
      </div>
    )
  }

  const column =
    // scroll-intent: reading-page — the phone's one vertical scroll, for
    // the reason `ReadingSession` gives; nothing nested scrolls vertically.
    "mx-auto flex h-full w-full max-w-lg flex-col gap-4 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"

  if (generating || play === null) {
    return (
      // scroll-intent: reading-page — the same one-column page as the round
      // itself; the form is taller than a phone.
      <div data-scroll-intent="reading-page" className={cn(column, className)}>
        {play === null && (
          <p className="text-sm text-muted-foreground">
            No rounds are available right now. You can make your own.
          </p>
        )}
        <GenerateRound
          buildPrompt={(request) => buildRoundPrompt({ ...request, recent })}
          onStart={handleOwnRound}
          {...(play === null ? {} : { onCancel: () => setGenerating(false) })}
        />
      </div>
    )
  }

  const { round } = play
  const artifacts: Array<SwitchableArtifact> = [
    {
      id: "algorithm",
      label: "Program",
      content: <SourcePanel algorithm={round.algorithm} />,
    },
    {
      id: "constraintDiff",
      label: "Bounds",
      content: <ConstraintDiff diff={round.constraintDiff} />,
    },
    {
      id: "budget",
      label: "Budget",
      content: <BudgetDisplay budget={round.budget} />,
    },
    {
      id: "diffSet",
      label: "Rewrites",
      content: (
        <DiffSetChoices
          options={presented}
          language={round.algorithm.language}
          picked={progress.picked}
          onPick={(index) =>
            setProgress((current) => ({ ...current, picked: index }))
          }
        />
      ),
    },
  ]
  if (probe !== null) {
    artifacts.push({
      id: "optionSet",
      label: "Which proposition?",
      content: (
        <div className="flex flex-col gap-4">
          <RoundChoices
            prompt={ROUND_PROBE_PROMPT}
            options={probe.options}
            answerId={probe.answerId}
            onCommit={handleCommit}
          />
          {progress.outcome !== null && (
            <>
              <RoundFeedback
                justification={probe.justification}
                {...(probe.gloss === undefined ? {} : { gloss: probe.gloss })}
              />
              <RoundOutcome state={progress.outcome} seed={play.seed} />
            </>
          )}
        </div>
      ),
    })
  }
  const focusId: ArtifactId | undefined =
    probe !== null ? "optionSet" : undefined
  const roundKey = `${play.own ? "own" : "corpus"}:${round.id}:${played}`

  return (
    // scroll-intent: reading-page — the phone's one vertical scroll, for the
    // reason `ReadingSession` gives; the switcher shows one artifact at a
    // time inside it, and nothing nested scrolls vertically.
    <div data-scroll-intent="reading-page" className={cn(column, className)}>
      <div className="flex shrink-0 items-center justify-between gap-3 px-1">
        <span className="text-sm font-medium text-foreground">
          {play.own ? "Your round" : `Round ${played + 1}`}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-11 gap-1.5"
          onClick={() => setGenerating(true)}
        >
          <Sparkles className="size-4" aria-hidden="true" /> Make your own
        </Button>
      </div>

      <ArtifactSwitcher
        artifacts={artifacts}
        roundId={roundKey}
        focusId={focusId}
        ariaLabel="Round"
        className="shrink-0"
      />

      {progress.outcome !== null && (
        <div className="shrink-0 pb-2 pt-1">
          <Button className="w-full" size="lg" onClick={handleNext}>
            Next round
          </Button>
        </div>
      )}
    </div>
  )
}
