/**
 * One grammar-lens item on a phone: the item, its step-down after a miss,
 * and its reveal (adaptive-learning canon Def. 4.9, Cor. 4.8, Rem. 4.15).
 *
 * The cue sits above the response line, read, heard or both. A pick's open
 * word takes one of the dock's candidates; a judge's words are each a
 * target, beside "Looks right". After a miss the step-down says only that,
 * and shows the line as it was answered; its questions are marked neither
 * right nor wrong. The reveal shows the line as authored, the rule, and the
 * words that decided it, and never what the line means: no English gloss
 * appears here (Cor. 4.8 (i)).
 */

import type { JSX, ReactNode } from "react"
import { assertNever, cn } from "@some-ui/core-utils"
import { Button, TakeItem } from "@some-ui/shared"
import type { TakeItemView, TakePlace } from "@some-ui/voice-capture"
import { StepLayout } from "@topik/components/topik/handheld/step-layout"
import type { Tense } from "@topik/lib/topik/read-aloud/content"
import { TENSES } from "@topik/lib/topik/read-aloud/content"
import type {
  CueModality,
  LensAnswer,
  LensItem,
  Probe,
} from "@topik/lib/topik/read-aloud/lens/items"
import {
  askedWord,
  shownMistakes,
} from "@topik/lib/topik/read-aloud/lens/items"
import type {
  LensOutcome,
  LensPhase,
} from "@topik/lib/topik/read-aloud/lens/machine"
import type { LensPlaying } from "@topik/lib/topik/read-aloud/lens/runtime"
import type { MistakeId } from "@topik/lib/topik/read-aloud/mistakes"
import { MISTAKES } from "@topik/lib/topik/read-aloud/mistakes"
import { Check, Ear, Eye, Volume2, X } from "lucide-react"

type LensCardProps = {
  item: LensItem
  phase: Extract<LensPhase, { name: "item" | "step-down" | "reveal" }>
  outcome: LensOutcome | undefined
  audio: boolean
  cueRead: boolean
  playing: LensPlaying
  short: boolean
  last: boolean
  onAnswer: (answer: LensAnswer) => void
  onProbe: (answer: string) => void
  onSkipProbes: () => void
  onSituation: (chosen: number) => void
  onNext: () => void
  onHearCue: () => void
  onHearLine: () => void
  /**
   * The learner's takes of the line (Rem. 4.16), as the take pattern shows
   * them: many a line, the newest played. Absent, none is offered.
   */
  take?: {
    view: TakeItemView
    /** A take is under way: what would sound into it waits. */
    taking: boolean
    /** No new take can be kept until home holds some of those kept. */
    full: boolean
    onTap: () => void
    onRedo: (id: string) => void
    onPlay: (id: string) => void
    onLetGo: (id: string, place: TakePlace) => void
  }
}

const TENSE_LABEL = {
  past: "Past",
  present: "Present",
  future: "Future",
} satisfies Record<Tense, string>

function probeQuestion(
  item: LensItem,
  probe: Probe
): {
  question: string
  options: Array<{ value: string; label: ReactNode; korean: boolean }>
} {
  const asked = askedWord(item)
  const wordOptions = item.words.flatMap((word, index) =>
    index === asked ? [] : [{ value: String(index), label: word, korean: true }]
  )
  switch (probe.kind) {
    case "tense": {
      return {
        question: `${probe.word} is…`,
        options: TENSES.map((value) => ({
          value,
          label: TENSE_LABEL[value],
          korean: false,
        })),
      }
    }
    case "subject": {
      return { question: "Which word is the subject?", options: wordOptions }
    }
    case "object": {
      return { question: "Which word is the object?", options: wordOptions }
    }
    case "verb": {
      return { question: "Which word is the verb?", options: wordOptions }
    }
    case "split": {
      return {
        question: `Where does the ending start in ${probe.word}?`,
        options: probe.cuts.map((cut) => ({
          value: String(cut),
          label: (
            <>
              {probe.word.slice(0, cut)}
              <span className="text-muted-foreground px-0.5 font-normal">
                +
              </span>
              {probe.word.slice(cut)}
            </>
          ),
          korean: true,
        })),
      }
    }
    default: {
      return assertNever(probe)
    }
  }
}

function verdictOf(
  item: LensItem,
  outcome: LensOutcome
): { good: boolean; title: string; body: Array<string> } {
  const { shape } = item
  const answer = outcome.answer
  const rule = (mistake: MistakeId): string => MISTAKES[mistake].rule
  const misformed = shape.kind === "judge" ? shape.misform : null
  const fix =
    misformed &&
    `${misformed.surface} → ${item.words[misformed.word] ?? ""}. ${rule(misformed.mistake)}`
  if (outcome.expired || answer === null) {
    return {
      good: false,
      title: "Time’s up.",
      body: fix ? [fix] : shownMistakes(item).map(rule),
    }
  }
  if (shape.kind === "pick") {
    if (outcome.right)
      return {
        good: true,
        title: "Right.",
        body: shownMistakes(item).map(rule),
      }
    const chosen =
      answer.kind === "pick" ? shape.candidates[answer.candidate] : undefined
    return {
      good: false,
      title: "Not this one.",
      body: [
        ...(chosen?.instead ? [chosen.instead] : []),
        ...(chosen?.mistake ? [rule(chosen.mistake)] : []),
      ],
    }
  }
  const { misform } = shape
  if (misform === null) {
    if (outcome.right) {
      return {
        good: true,
        title: "Right, nothing wrong.",
        body: ["This line is right as written."],
      }
    }
    const tapped = answer.kind === "word" ? item.words[answer.word] : undefined
    return {
      good: false,
      title: "This one was right as written.",
      body: tapped ? [`${tapped} is right as it stands.`] : [],
    }
  }
  const body = fix ? [fix] : []
  if (outcome.right) return { good: true, title: "Caught it.", body }
  if (answer.kind === "word") {
    return {
      good: false,
      title: "The mistake was somewhere else.",
      body: [`${item.words[answer.word] ?? ""} is right.`, ...body],
    }
  }
  return {
    good: false,
    title: "There was a mistake.",
    body,
  }
}

const ModeIcon = ({ modality }: { modality: CueModality }): JSX.Element => (
  <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
    {modality !== "audio" && <Eye className="size-3.5" aria-hidden="true" />}
    {modality !== "glyph" && <Ear className="size-3.5" aria-hidden="true" />}
    {modality === "glyph"
      ? "Shown"
      : modality === "audio"
        ? "Heard"
        : "Shown and heard"}
  </span>
)

/**
 * Record yourself reading the line as authored, then play it back (Rem.
 * 4.16): the take pattern's parts. While the phone has kept as many as it
 * can, nothing records, the line says what makes room, and the takes still
 * play.
 */
const LineTakes = ({
  take,
}: {
  take: NonNullable<LensCardProps["take"]>
}): JSX.Element => {
  const { view } = take
  return (
    <div data-slot="lens-take">
      <TakeItem
        view={view}
        label="Your takes of B"
        onTap={take.onTap}
        onPlay={take.onPlay}
        onRedo={take.onRedo}
        onLetGo={take.onLetGo}
        full={
          take.full && !take.taking
            ? "This phone has kept as many takes as it can until a home it's paired with has the ones on it."
            : undefined
        }
      />
    </div>
  )
}

export const LensCard = ({
  item,
  phase,
  outcome,
  audio,
  cueRead,
  playing,
  short,
  last,
  onAnswer,
  onProbe,
  onSkipProbes,
  onSituation,
  onNext,
  onHearCue,
  onHearLine,
  take,
}: LensCardProps): JSX.Element => {
  const answering = phase.name === "item"
  const revealed = phase.name === "reveal"
  const { shape } = item
  const answer = outcome?.answer ?? null
  const modality = item.cue && (audio && !cueRead ? item.cue.modality : "glyph")
  const cueText = item.cue && (modality !== "audio" || !answering)
  const cueHeard = audio && !cueRead && modality !== "glyph"

  const cue = item.cue && modality && (
    <section
      data-slot="lens-cue"
      className="bg-muted/50 flex w-full flex-col gap-2 rounded-2xl p-3 text-left"
    >
      <div className="flex items-center gap-2">
        <span className="bg-primary text-primary-foreground grid size-6 place-items-center rounded-md text-xs font-semibold">
          A
        </span>
        <ModeIcon modality={modality} />
      </div>
      {cueText ? (
        <p lang="ko" className="text-lg break-keep">
          {revealed
            ? item.cue.segments.map((segment) =>
                segment.kind === "word" &&
                item.cue?.decides.includes(segment.text) ? (
                  <mark
                    key={segment.key}
                    className="bg-warning/15 text-warning rounded px-0.5"
                  >
                    {segment.text}
                  </mark>
                ) : (
                  <span key={segment.key}>{segment.text}</span>
                )
              )
            : item.cue.korean}
        </p>
      ) : (
        <p
          className={cn(
            "text-muted-foreground flex items-center gap-2 text-sm",
            playing === "cue" && "text-primary"
          )}
        >
          <Ear className="size-4" />
          {playing === "cue" ? "Listening…" : "Listen to A, then answer B."}
        </p>
      )}
    </section>
  )

  // The line flows as text, so punctuation and numbers stay with their word.
  const line = (
    <p
      lang="ko"
      data-slot="lens-line"
      className={cn(
        "text-center font-semibold break-keep",
        short ? "text-xl" : "text-2xl leading-relaxed"
      )}
    >
      {item.segments.map((segment) => {
        if (segment.kind === "gap") {
          return <span key={segment.key}>{segment.text}</span>
        }
        const { word, text } = segment
        const decided = revealed && item.decides.includes(word)
        const mark = decided && "bg-warning/15 text-warning rounded px-1"
        if (shape.kind === "pick" && word === shape.word) {
          const chosen =
            answer?.kind === "pick"
              ? shape.candidates[answer.candidate]
              : undefined
          // The step-down shows the form chosen, unmarked; the authored form
          // waits for the reveal.
          if (chosen && !revealed) {
            return (
              <span
                key={segment.key}
                data-slot="lens-open"
                className="border-muted-foreground border-b-2 border-dashed"
              >
                {chosen.surface}
              </span>
            )
          }
          if (!revealed) {
            return (
              <span
                key={segment.key}
                data-slot="lens-open"
                className="whitespace-nowrap"
              >
                {shape.prefix}
                <span className="border-muted-foreground text-muted-foreground inline-block min-w-[2em] border-b-2 border-dashed text-center">
                  {" "}
                </span>
              </span>
            )
          }
          return (
            <span key={segment.key} className="whitespace-nowrap">
              {chosen?.mistake && (
                <s className="text-destructive mr-1 decoration-2">
                  {chosen.surface}
                </s>
              )}
              <span className="text-success underline decoration-2 underline-offset-4">
                {text}
              </span>
            </span>
          )
        }
        const misformed =
          shape.kind === "judge" && shape.misform?.word === word
            ? shape.misform
            : null
        const tapped = answer?.kind === "word" && answer.word === word
        if (answering && shape.kind === "judge") {
          return (
            <button
              key={segment.key}
              type="button"
              data-word={word}
              onClick={() => onAnswer({ kind: "word", word })}
              className="hover:bg-muted rounded-t-md border-b-2 border-dotted px-1 active:scale-95"
            >
              {misformed?.surface ?? text}
            </button>
          )
        }
        if (misformed && revealed) {
          return (
            <span key={segment.key} className="whitespace-nowrap">
              <s className="text-destructive mr-1 decoration-2">
                {misformed.surface}
              </s>
              <span className="text-success">{text}</span>
            </span>
          )
        }
        return (
          <span
            key={segment.key}
            className={cn(
              tapped &&
                revealed &&
                "text-destructive rounded bg-destructive/10 px-1",
              mark
            )}
          >
            {misformed?.surface ?? text}
          </span>
        )
      })}
    </p>
  )

  const step = phase.name === "step-down" ? phase.step : null
  const probe = step === null ? undefined : item.probes[step]
  const asked = probe && probeQuestion(item, probe)
  const verdict = revealed && outcome ? verdictOf(item, outcome) : null
  const entries = shownMistakes(item)

  const stage = (
    <div
      data-slot="lens-card"
      data-phase={phase.name}
      className="mx-auto flex w-full max-w-md flex-col items-center gap-4"
    >
      {cue}
      <div className="flex w-full flex-col items-center gap-2">
        <span className="text-muted-foreground self-start text-xs font-medium tracking-wider uppercase">
          {answering
            ? shape.kind === "pick"
              ? "B · Choose what fits"
              : "B · Tap the mistake, or say it looks right"
            : "B"}
        </span>
        {line}
      </div>
      {asked && (
        <div
          data-slot="lens-probe"
          className="flex flex-col items-center gap-1"
        >
          <p className="text-muted-foreground text-sm">
            Not this one. First, a quick check.
          </p>
          <p className="text-base font-semibold">{asked.question}</p>
        </div>
      )}
      {verdict && (
        <div
          data-slot="lens-reveal"
          className="flex w-full flex-col gap-2 text-left"
        >
          <p
            className={cn(
              "flex items-center gap-2 text-base font-semibold",
              verdict.good ? "text-success" : "text-destructive"
            )}
          >
            {verdict.good ? (
              <Check className="size-5" />
            ) : (
              <X className="size-5" />
            )}
            {verdict.title}
          </p>
          {entries.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {entries.map((mistake) => (
                <span
                  key={mistake}
                  className="border-primary/40 bg-primary/10 text-primary rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                >
                  {MISTAKES[mistake].name}
                </span>
              ))}
            </div>
          )}
          {verdict.body.map((text) => (
            <p key={text} className="text-sm leading-relaxed">
              {text}
            </p>
          ))}
        </div>
      )}
    </div>
  )

  // A take under way holds what would sound into it, and the next item.
  const recording = take?.taking === true
  const cueButton = (label: string): JSX.Element => (
    <Button
      variant="outline"
      className={cn(
        "h-12 min-w-0 flex-1 gap-2 rounded-2xl",
        playing === "cue" && "ring-primary ring-2"
      )}
      disabled={recording}
      onClick={onHearCue}
    >
      <Ear className="size-5" /> {label}
    </Button>
  )

  let dock: ReactNode
  if (answering) {
    dock = (
      <>
        {cueHeard && cueButton("Play A")}
        {shape.kind === "pick" ? (
          <div className="grid grid-cols-2 gap-2">
            {shape.candidates.map((candidate, index) => (
              <Button
                key={candidate.surface}
                variant="outline"
                lang="ko"
                className="h-14 rounded-2xl text-lg font-semibold"
                onClick={() => onAnswer({ kind: "pick", candidate: index })}
              >
                {candidate.label}
              </Button>
            ))}
          </div>
        ) : (
          <Button
            variant="outline"
            className="h-14 rounded-2xl text-base"
            onClick={() => onAnswer({ kind: "fine" })}
          >
            Looks right
          </Button>
        )}
      </>
    )
  } else if (asked) {
    dock = (
      <>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            Quick check {(step ?? 0) + 1}
          </span>
          <Button
            variant="link"
            size="sm"
            className="text-muted-foreground"
            onClick={onSkipProbes}
          >
            Skip
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {asked.options.map((option) => (
            <Button
              key={option.value}
              variant="outline"
              lang={option.korean ? "ko" : undefined}
              className="h-12 rounded-xl text-base"
              onClick={() => onProbe(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </>
    )
  } else {
    const situation = outcome?.situation
    dock = (
      <>
        {item.situations && situation && (
          <div data-slot="lens-situation" className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs">
              Optional · When would someone say B?
            </span>
            {item.situations.options.map((option, index) => (
              <Button
                key={option}
                variant={situation.chosen === index ? "secondary" : "outline"}
                aria-pressed={situation.chosen === index}
                className="h-auto justify-start rounded-xl py-2 text-left text-sm whitespace-normal"
                onClick={() => onSituation(index)}
              >
                {option}
              </Button>
            ))}
            {situation.chosen !== null && (
              <span className="text-muted-foreground text-xs">Noted.</span>
            )}
          </div>
        )}
        {audio && (
          <div className="flex gap-2">
            {item.cue && !cueRead && cueButton("Hear A")}
            <Button
              variant="secondary"
              className={cn(
                "h-12 min-w-0 flex-1 gap-2 rounded-2xl",
                playing === "line" && "ring-primary ring-2"
              )}
              disabled={recording}
              onClick={onHearLine}
            >
              <Volume2 className="size-5" /> Hear B
            </Button>
          </div>
        )}
        {take && <LineTakes take={take} />}
        <Button
          className="h-12 rounded-2xl"
          disabled={recording}
          onClick={onNext}
        >
          {last ? "Finish the set" : "Next"}
        </Button>
      </>
    )
  }

  return (
    <StepLayout
      short={short}
      stage={stage}
      dock={dock}
      longForm={revealed}
      // The situation's options and the line's takes can outgrow the dock.
      dockScrolls={
        revealed &&
        (outcome?.situation != null || (take?.view.current.length ?? 0) > 0)
      }
    />
  )
}
