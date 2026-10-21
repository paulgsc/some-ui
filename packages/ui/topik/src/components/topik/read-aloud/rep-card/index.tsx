import type { JSX } from "react"
import { useEffect, useRef, useState } from "react"
import { cn } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"
import { StepLayout } from "@topik/components/topik/handheld/step-layout"
import { GlyphLine } from "@topik/components/topik/read-aloud/glyph-line"
import type { ReadAloudDeck } from "@topik/lib/topik/read-aloud/content"
import type { GlyphMode } from "@topik/lib/topik/read-aloud/glyphs"
import {
  glossOf,
  markAt,
  markWeights,
} from "@topik/lib/topik/read-aloud/glyphs"
import type { SentencePool } from "@topik/lib/topik/read-aloud/set-builder"
import type {
  IntroductionStep,
  QueueEntry,
  RepStep,
} from "@topik/lib/topik/read-aloud/set-machine"
import {
  POOL_BAR_LABEL,
  reasonOf,
} from "@topik/lib/topik/read-aloud/sitting-words"
import type { Mark } from "@topik/lib/topik/read-aloud/tally"
import { TALLY_WORDS } from "@topik/lib/topik/read-aloud/tally-words"
import { SPEECH_MS_PER_SYLLABLE } from "@topik/lib/topik/read-aloud/timing"
import { Hand, Play, SkipForward } from "lucide-react"

type RepCardStep = RepStep | IntroductionStep | "paused"

type RepCardProps = {
  deck: ReadAloudDeck
  entry: QueueEntry
  step: RepCardStep
  /** How long the current step's clock runs, and which step it belongs to. */
  stepMs: number | null
  stepKey: number
  /** Whether the learner has reported this entry stuck. */
  reported: boolean
  /** Whether this step's audio has started playing. */
  playing: boolean
  /** How much of the sentences the sitting has shown; absent shows no bar. */
  pool?: SentencePool
  /**
   * Whether the screen has shown this before (Rem. 7.5); absent shows none.
   * With `onOpen` it opens what the phone kept about it.
   */
  exposure?: { kind: Mark; onOpen?: () => void }
  short: boolean
  onStuck: () => void
  onSkip: () => void
  /** Absent while the host's session holds the drill: it resumes that way. */
  onResume?: () => void
}

/** In place of Resume, while the host's session holds the drill. */
export const HeldNote = (): JSX.Element => (
  <p className="text-muted-foreground py-3 text-center text-sm">
    Resumes with the session
  </p>
)

const LABEL: Record<RepCardStep, string> = {
  glyphs: "Read it aloud",
  turn: "Your turn",
  audio: "Listen",
  echo: "Say it again",
  gloss: "",
  "intro-audio": "New word",
  "intro-hold": "New word",
  paused: "Paused",
}

/** How each step draws the glyphs (Cor. 4.6 (iv)). */
const MODE: Record<RepCardStep, GlyphMode> = {
  glyphs: "spelled",
  turn: "spelled",
  audio: "pronounced",
  echo: "pronounced",
  gloss: "divided",
  "intro-audio": "spelled",
  "intro-hold": "spelled",
  paused: "spelled",
}

/**
 * Steps the mark through the blocks over `ms`, a syllable's share at a
 * time, so each block holds it for as many syllables as it has; starts
 * again whenever `runKey` changes, and is null when inactive.
 */
function useMarch(
  weights: Array<number>,
  ms: number,
  runKey: number,
  active: boolean
): number | null {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  const [tick, setTick] = useState({ runKey, syllable: 0 })
  useEffect(() => {
    if (!active || total < 1) return
    const every = Math.max(1, ms / total)
    const timer = setInterval(() => {
      setTick((prev) => ({
        runKey,
        syllable: Math.min(
          prev.runKey === runKey ? prev.syllable + 1 : 1,
          total - 1
        ),
      }))
    }, every)
    return (): void => clearInterval(timer)
  }, [total, ms, runKey, active])
  if (!active) return null
  return markAt(weights, tick.runKey === runKey ? tick.syllable : 0)
}

/** A hollow ring for what is new, dots for what has been seen before. */
const MarkGlyph = ({ kind }: { kind: Mark }): JSX.Element =>
  kind === "new" ? (
    <span
      aria-hidden="true"
      className="size-2.5 shrink-0 rounded-full border-2 border-current"
    />
  ) : (
    <span aria-hidden="true" className="flex shrink-0 gap-0.5">
      {[0, 1, 2].map((dot) => (
        <span key={dot} className="size-1.5 rounded-full bg-current" />
      ))}
    </span>
  )

/**
 * The mark beside the step label, outside the live region: it holds still
 * while the steps change and is not announced with them. `text-foreground`,
 * since the muted colour misses 4.5:1 in the topik dark theme.
 */
const MarkChip = ({
  kind,
  onOpen,
}: NonNullable<RepCardProps["exposure"]>): JSX.Element => {
  const look =
    "text-foreground inline-flex items-center gap-1.5 text-xs font-medium"
  const inside = (
    <>
      <MarkGlyph kind={kind} />
      {TALLY_WORDS.mark(kind)}
    </>
  )
  return onOpen ? (
    <button
      type="button"
      data-slot="read-aloud-mark"
      data-mark={kind}
      aria-label={TALLY_WORDS.openFacts(kind)}
      onClick={onOpen}
      // A 44px target, as tall as the row it sits in.
      className={cn(
        look,
        "min-h-11 px-2 underline decoration-dotted underline-offset-4"
      )}
    >
      {inside}
    </button>
  ) : (
    <span data-slot="read-aloud-mark" data-mark={kind} className={look}>
      {inside}
    </span>
  )
}

const PoolBar = ({ pool }: { pool: SentencePool }): JSX.Element => (
  <div
    data-slot="read-aloud-pool"
    role="meter"
    aria-label={POOL_BAR_LABEL}
    aria-valuemin={0}
    aria-valuemax={pool.of}
    aria-valuenow={pool.shown}
    className="bg-muted h-1 w-full shrink-0 overflow-hidden rounded-full"
  >
    {/* foreground at 80% over the track keeps 3:1 or better in both themes */}
    <div
      className="bg-foreground/80 h-full rounded-full"
      style={{ width: `${(pool.shown / pool.of) * 100}%` }}
    />
  </div>
)

/** A bar that empties over the step's clock: the turn, or the echo. */
const Meter = ({ ms, runKey }: { ms: number; runKey: number }): JSX.Element => {
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = bar.current
    if (!element || typeof element.animate !== "function") return
    const animation = element.animate(
      [{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }],
      { duration: ms, easing: "linear", fill: "forwards" }
    )
    return (): void => animation.cancel()
  }, [ms, runKey])
  return (
    <div
      data-slot="read-aloud-meter"
      aria-hidden="true"
      className="bg-muted h-1.5 w-full max-w-xs overflow-hidden rounded-full"
    >
      <div ref={bar} className="bg-primary h-full w-full origin-left" />
    </div>
  )
}

/**
 * One read-aloud rep, or an introduction (adaptive-learning canon Def. 4.8,
 * Cor. 4.6).
 *
 * The ladder runs itself: glyphs, the learner's turn, the audio, the echo,
 * the gloss. The only controls are the two the canon names - report stuck,
 * which plays the audio at once, and skip - and neither is needed for a set
 * to run hands-free.
 */
export const RepCard = ({
  deck,
  entry,
  step,
  stepMs,
  stepKey,
  reported,
  playing,
  pool,
  exposure,
  short,
  onStuck,
  onSkip,
  onResume,
}: RepCardProps): JSX.Element => {
  const { item } = entry
  const reason = reasonOf(entry.role, step)
  const introduction = step === "intro-audio" || step === "intro-hold"
  const weights = markWeights(item)
  const marchMs =
    step === "turn"
      ? (stepMs ?? 0)
      : Math.max(1, item.syllables * SPEECH_MS_PER_SYLLABLE)
  const mark = useMarch(
    weights,
    marchMs,
    stepKey,
    // The audio's mark starts with the sound, not with the request for it:
    // a server voice can take a while to begin.
    step === "turn" || (step === "audio" && playing)
  )
  const gloss = step === "gloss" || introduction ? glossOf(deck, item) : null
  const metered = (step === "turn" || step === "echo") && stepMs !== null

  const stage = (
    <div
      data-slot="read-aloud-rep"
      data-step={step}
      data-kind={item.kind}
      className="flex w-full max-w-md flex-col items-center gap-4 text-center"
    >
      <div className="flex min-h-4 max-w-full flex-wrap items-baseline justify-center gap-x-3 gap-y-1">
        <div
          aria-live="polite"
          className="flex max-w-full flex-wrap items-baseline justify-center gap-x-2"
        >
          <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            {LABEL[step]}
          </span>
          {reason !== null && (
            <span
              data-slot="read-aloud-reason"
              className="text-foreground text-xs font-medium"
            >
              {reason}
            </span>
          )}
        </div>
        {exposure && <MarkChip {...exposure} />}
      </div>

      <GlyphLine
        deck={deck}
        item={item}
        mode={MODE[step]}
        mark={mark}
        short={short}
      />

      {metered && <Meter ms={stepMs} runKey={stepKey} />}

      {gloss?.kind === "word" && (
        <p className="text-base leading-relaxed">
          <span lang="ko" className="font-semibold">
            {gloss.lemma}
          </span>
          <span className="text-muted-foreground"> · {gloss.meaning}</span>
        </p>
      )}

      {gloss?.kind === "sentence" && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-muted-foreground text-base leading-relaxed">
            {gloss.english}
          </p>
          <ul
            aria-label="Words in this sentence"
            className="flex flex-wrap justify-center gap-1.5"
          >
            {gloss.words.map((word) => (
              <li
                key={word.wordId}
                className="bg-muted rounded-lg px-2 py-1 text-sm"
              >
                <span lang="ko" className="font-medium">
                  {word.lemma}
                </span>
                <span className="text-muted-foreground"> {word.meaning}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )

  const controls =
    step === "paused" ? (
      onResume ? (
        <Button className="h-12 gap-2 rounded-2xl" onClick={onResume}>
          <Play className="size-5" /> Resume
        </Button>
      ) : (
        <HeldNote />
      )
    ) : (
      <div className="flex gap-2">
        <Button
          variant="secondary"
          className={cn(
            "h-14 min-w-0 flex-1 gap-2 rounded-2xl text-base",
            reported && "ring-primary ring-2"
          )}
          onClick={onStuck}
          disabled={introduction}
          aria-pressed={reported}
        >
          <Hand className="size-5" /> Stuck
        </Button>
        <Button
          variant="ghost"
          className="h-14 gap-2 rounded-2xl px-4"
          onClick={onSkip}
        >
          <SkipForward className="size-5" /> Skip
        </Button>
      </div>
    )

  const dock = (
    <>
      {controls}
      {pool && pool.of > 0 && <PoolBar pool={pool} />}
    </>
  )

  return (
    <StepLayout
      short={short}
      stage={stage}
      dock={dock}
      longForm={gloss?.kind === "sentence"}
    />
  )
}
