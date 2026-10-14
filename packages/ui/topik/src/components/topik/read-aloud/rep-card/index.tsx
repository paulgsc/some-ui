import type { JSX } from "react"
import { useEffect, useRef, useState } from "react"
import { cn } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"
import { StepLayout } from "@topik/components/topik/handheld/step-layout"
import type { GlyphLens } from "@topik/components/topik/read-aloud/glyph-line"
import { GlyphLine } from "@topik/components/topik/read-aloud/glyph-line"
import {
  LensBadge,
  PickHint,
  ROLE_LOOK,
  TENSE_LOOK,
  TenseChoices,
} from "@topik/components/topik/read-aloud/lens-parts"
import type { ReadAloudDeck } from "@topik/lib/topik/read-aloud/content"
import type { GlyphMode } from "@topik/lib/topik/read-aloud/glyphs"
import {
  glossOf,
  lineOf,
  markAt,
  markWeights,
} from "@topik/lib/topik/read-aloud/glyphs"
import type { LensAnswer } from "@topik/lib/topik/read-aloud/lens"
import { lensOutcome, lensWords } from "@topik/lib/topik/read-aloud/lens"
import type {
  IntroductionStep,
  QueueEntry,
  RepStep,
} from "@topik/lib/topik/read-aloud/set-machine"
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
  /** The learner's answer to the entry's lens, if it carries one. */
  answer: LensAnswer | null
  /** The gloss has shown the lens's answer: it stays shown, and closed. */
  revealed: boolean
  onAnswer: (answer: LensAnswer) => void
  /** Whether this step's audio has started playing. */
  playing: boolean
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
 *
 * A sentence drawn with a grammar lens (`read-aloud/lens`) also asks its
 * question above the line, and takes an answer until the gloss: a word of
 * the line for a role, one of three tenses for a tense. The gloss shows the
 * answer whether or not one came, and tints the card with the tense.
 */
export const RepCard = ({
  deck,
  entry,
  step,
  stepMs,
  stepKey,
  reported,
  answer,
  revealed,
  onAnswer,
  playing,
  short,
  onStuck,
  onSkip,
  onResume,
}: RepCardProps): JSX.Element => {
  const { item } = entry
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

  const lens = item.kind === "sentence" ? item.lens : undefined
  const shown = step === "gloss" || revealed
  const open = !shown && !introduction && step !== "paused"
  const outcome = lens && shown ? lensOutcome(lens, answer) : null
  const weather =
    lens?.kind === "tense" && shown ? TENSE_LOOK[lens.tense] : null
  const look =
    lens?.kind === "role"
      ? ROLE_LOOK[lens.role]
      : lens
        ? TENSE_LOOK[lens.tense]
        : null
  const lineWords = lineOf(deck, item.lineId)?.words ?? []
  const answerWords = lens ? lensWords(lens, lineWords.length) : []
  const glyphLens: GlyphLens | undefined = lens && {
    pick:
      lens.kind === "role" && open
        ? {
            picked: answer?.kind === "word" ? answer.word : null,
            onPick: (word) => onAnswer({ kind: "word", word }),
          }
        : undefined,
    shown:
      shown && look
        ? {
            words: answerWords,
            frame: cn(look.tint, look.ring),
            ending: look.text,
            missed:
              outcome === "missed" && answer?.kind === "word"
                ? answer.word
                : null,
          }
        : undefined,
  }

  const stage = (
    <div
      data-slot="read-aloud-rep"
      data-step={step}
      data-kind={item.kind}
      className={cn(
        "flex w-full max-w-md flex-col items-center gap-4 text-center",
        lens && "rounded-3xl px-3 py-5 transition-colors duration-700",
        weather?.card
      )}
    >
      {lens && (
        <LensBadge
          lens={lens}
          outcome={outcome}
          answer={answerWords
            .map((word) => lineWords[word]?.surface ?? "")
            .join(" ")}
        />
      )}

      <span
        aria-live="polite"
        className="text-muted-foreground min-h-4 text-xs font-medium tracking-wider uppercase"
      >
        {LABEL[step]}
      </span>

      <GlyphLine
        deck={deck}
        item={item}
        mode={MODE[step]}
        mark={mark}
        short={short}
        lens={glyphLens}
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

  const dock =
    step === "paused" ? (
      onResume ? (
        <Button className="h-12 gap-2 rounded-2xl" onClick={onResume}>
          <Play className="size-5" /> Resume
        </Button>
      ) : (
        <HeldNote />
      )
    ) : (
      <>
        {lens?.kind === "role" && open && <PickHint picked={answer !== null} />}
        {lens?.kind === "tense" && (
          <TenseChoices
            picked={answer?.kind === "tense" ? answer.tense : null}
            shown={shown ? lens.tense : null}
            onPick={(tense) => onAnswer({ kind: "tense", tense })}
          />
        )}
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
