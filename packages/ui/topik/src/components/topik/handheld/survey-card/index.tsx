import type { JSX } from "react"
import { useState } from "react"
import { Button, Textarea } from "@some-ui/shared"
import { StepLayout } from "@topik/components/topik/handheld/step-layout"
import type {
  Difficulty,
  Enthusiasm,
  LessonSurvey,
  StuckCandidate,
  Worthwhile,
} from "@topik/lib/topik/core/lesson-survey"
import { MAX_BECOMING_LENGTH } from "@topik/lib/topik/core/lesson-survey"
import { Check } from "lucide-react"
import { assertNever, cn } from "some-ui-utils"

type SurveyCardProps = {
  /** Probes missed on first presentation; the blocking step is skipped without them. */
  candidates: Array<StuckCandidate>
  short: boolean
  onSubmit: (survey: LessonSurvey) => void
  /** Leaves without a report: the survey never gates the recap. */
  onSkip: () => void
  /** Stories and layout sweeps open on a later question. */
  initialStep?: SurveyStep
}

type Choice<T extends string> = { value: T; label: string }

const WORTHWHILE_CHOICES: Array<Choice<Worthwhile>> = [
  { value: "yes", label: "Yes, worth it" },
  { value: "somewhat", label: "Somewhat" },
  { value: "no", label: "Not really" },
]

const DIFFICULTY_CHOICES: Array<Choice<Difficulty>> = [
  { value: "too-easy", label: "Too easy" },
  { value: "right", label: "About right" },
  { value: "too-hard", label: "Too hard" },
]

const ENTHUSIASM_CHOICES: Array<Choice<Enthusiasm>> = [
  { value: "keen", label: "Keen for the next one" },
  { value: "neutral", label: "Either way" },
  { value: "drained", label: "Running out of steam" },
]

export type SurveyStep =
  | "worthwhile"
  | "difficulty"
  | "blocking"
  | "enthusiasm"
  | "becoming"

const QUESTIONS: Record<SurveyStep, string> = {
  worthwhile: "Was this lesson worthwhile?",
  difficulty: "How did it feel?",
  blocking: "Was anything blocking you?",
  enthusiasm: "How keen are you for the next one?",
  becoming: "What do you feel these lessons are making you into?",
}

/**
 * The learner's verdict on the lesson, asked once it is complete and before
 * the recap (adaptive-learning canon Cor. 3.4). One question a screen, answers
 * in the dock where the thumb is, as every other handheld step. Nothing here
 * claims the lesson taught anything (Rem. 3.3): it asks whether the lesson
 * fit - worth it, too hard, blocking, worth coming back to.
 */
export const SurveyCard = ({
  candidates,
  short,
  onSubmit,
  onSkip,
  initialStep,
}: SurveyCardProps): JSX.Element => {
  const steps: Array<SurveyStep> = [
    "worthwhile",
    "difficulty",
    ...(candidates.length > 0 ? (["blocking"] as const) : []),
    "enthusiasm",
    "becoming",
  ]
  const [index, setIndex] = useState(() =>
    Math.max(0, initialStep ? steps.indexOf(initialStep) : 0)
  )
  const [survey, setSurvey] = useState<LessonSurvey>({ stuck: [] })
  const step = steps[index] ?? "becoming"

  const advance = (next: LessonSurvey): void => {
    setSurvey(next)
    setIndex((current) => current + 1)
  }

  const choices = <T extends string>(
    options: Array<Choice<T>>,
    pick: (value: T) => LessonSurvey
  ): JSX.Element => (
    <div
      role="group"
      aria-label={QUESTIONS[step]}
      className="flex flex-col gap-2"
    >
      {options.map((option) => (
        <Button
          key={option.value}
          variant="outline"
          className="h-12 w-full rounded-2xl text-base"
          onClick={() => advance(pick(option.value))}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )

  const skipThis = (
    <Button
      variant="ghost"
      className="h-11 w-full rounded-2xl"
      onClick={index === 0 ? onSkip : (): void => setIndex(index + 1)}
    >
      {index === 0 ? "Not now" : "Skip"}
    </Button>
  )

  const isStuck = (candidate: StuckCandidate): boolean =>
    survey.stuck.some(
      (entry) =>
        entry.batchId === candidate.batchId &&
        entry.probeId === candidate.probeId
    )

  const toggle = (candidate: StuckCandidate): void => {
    setSurvey((current) => ({
      ...current,
      stuck: isStuck(candidate)
        ? current.stuck.filter(
            (entry) =>
              entry.batchId !== candidate.batchId ||
              entry.probeId !== candidate.probeId
          )
        : [
            ...current.stuck,
            { batchId: candidate.batchId, probeId: candidate.probeId },
          ],
    }))
  }

  const stage = (
    <div
      data-slot="topik-survey"
      className="flex w-full flex-col gap-3 text-center"
    >
      <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
        Before the recap · {index + 1} of {steps.length}
      </p>
      <p className={cn("font-semibold", short ? "text-lg" : "text-xl")}>
        {QUESTIONS[step]}
      </p>
      {step === "blocking" && (
        <p className="text-muted-foreground text-sm">
          These are the ones you missed. Pick any that held you up.
        </p>
      )}
      {step === "becoming" && (
        <p className="text-muted-foreground text-sm">
          Optional, in your own words.
        </p>
      )}
    </div>
  )

  const dock = ((): JSX.Element => {
    switch (step) {
      case "worthwhile": {
        return (
          <>
            {choices(WORTHWHILE_CHOICES, (worthwhile) => ({
              ...survey,
              worthwhile,
            }))}
            {skipThis}
          </>
        )
      }
      case "difficulty": {
        return (
          <>
            {choices(DIFFICULTY_CHOICES, (difficulty) => ({
              ...survey,
              difficulty,
            }))}
            {skipThis}
          </>
        )
      }
      case "enthusiasm": {
        return (
          <>
            {choices(ENTHUSIASM_CHOICES, (enthusiasm) => ({
              ...survey,
              enthusiasm,
            }))}
            {skipThis}
          </>
        )
      }
      case "blocking": {
        return (
          <>
            <div
              role="group"
              aria-label={QUESTIONS.blocking}
              className="flex flex-col gap-2"
            >
              {candidates.map((candidate) => {
                const on = isStuck(candidate)
                return (
                  <button
                    key={`${candidate.batchId}:${candidate.probeId}`}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(candidate)}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-2xl border px-4 py-2 text-left transition-colors",
                      on
                        ? "border-primary/40 bg-primary/15"
                        : "border-border bg-card"
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span lang="ko" className="block truncate font-medium">
                        {candidate.source}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {candidate.prompt}
                      </span>
                    </span>
                    {on && (
                      <Check
                        aria-hidden
                        className="text-primary size-5 shrink-0"
                      />
                    )}
                  </button>
                )
              })}
            </div>
            <Button
              className="h-12 w-full rounded-2xl"
              onClick={() => setIndex(index + 1)}
            >
              {survey.stuck.length === 0 ? "Nothing was blocking" : "Continue"}
            </Button>
          </>
        )
      }
      case "becoming": {
        return (
          <>
            <Textarea
              aria-label={QUESTIONS.becoming}
              placeholder="e.g. following a drama without subtitles"
              maxLength={MAX_BECOMING_LENGTH}
              rows={short ? 2 : 3}
              value={survey.becoming ?? ""}
              onChange={(event) =>
                setSurvey({ ...survey, becoming: event.target.value })
              }
              className="rounded-2xl text-base"
            />
            <Button
              className="h-12 w-full rounded-2xl"
              onClick={() => onSubmit(survey)}
            >
              Done
            </Button>
          </>
        )
      }
      default: {
        return assertNever(step)
      }
    }
  })()

  return <StepLayout short={short} stage={stage} dock={dock} />
}
