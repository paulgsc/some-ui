import type { JSX } from "react"
import { useMemo, useState } from "react"
import { Button } from "@some-ui/shared"
import { StepLayout } from "@topik/components/topik/handheld/step-layout"
import type { Tile } from "@topik/components/topik/handheld/tile-board"
import {
  AnswerTray,
  TilePool,
  toTiles,
} from "@topik/components/topik/handheld/tile-board"
import type { Message, Question } from "@topik/lib/topik"
import type {
  CheckOutcome,
  ResponseChannel,
} from "@topik/lib/topik/core/lesson-track"
import {
  buildFallbackOptions,
  buildTileBoard,
  excerptRevealsAnswer,
  gradeAssembly,
  gradeSelection,
} from "@topik/lib/topik/core/tile-assembly"
import {
  CheckCircle2,
  ChevronRight,
  RotateCcw,
  Volume2,
  XCircle,
} from "lucide-react"
import { cn } from "some-ui-utils"

type CheckCardProps = {
  question: Question
  /** Seeds the board: same item, same board, across renders and resumes. */
  seedKey: string
  /** The line this check is about. */
  anchor: Message | undefined
  /** The conversation's other questions and lines, for distractors. */
  siblings: Array<Question>
  lines: Array<Message>
  answered: CheckOutcome | null
  repeat: boolean
  audio: boolean
  speaking: boolean
  short: boolean
  onReplayAnchor: () => void
  onAnswer: (
    correct: boolean,
    response: string,
    channel: ResponseChannel
  ) => void
  onNext: () => void
}

type Response =
  | { channel: "selection"; options: Array<string>; correct: number | null }
  | {
      channel: "assembly"
      tiles: Array<Tile>
      joiner: "" | " "
    }

/**
 * How this item is answered on a touch screen (adaptive-learning canon
 * Cor. 4.4, *Check*). A multiple-choice item stays a selection. A free-text
 * item becomes assembly (Def. 4.5) when its answer can be tiled, and a
 * selection among the conversation's answers when it cannot - and the outcome
 * records which, because the two are different evidence (Rem. 4.6).
 */
function responseFor(
  question: Question,
  seedKey: string,
  siblings: Array<Question>,
  lines: Array<Message>
): Response {
  if (question.type === "multiple-choice" && question.options?.length) {
    return {
      channel: "selection",
      options: question.options,
      correct: question.correct ?? null,
    }
  }
  const board = buildTileBoard(
    question,
    seedKey,
    lines.map((line) => line.korean || line.content)
  )
  if (board) {
    return {
      channel: "assembly",
      tiles: toTiles(board.tiles),
      joiner: board.joiner,
    }
  }
  return {
    channel: "selection",
    options: buildFallbackOptions(question, seedKey, siblings),
    correct: null,
  }
}

export const CheckCard = ({
  question,
  seedKey,
  anchor,
  siblings,
  lines,
  answered,
  repeat,
  audio,
  speaking,
  short,
  onReplayAnchor,
  onAnswer,
  onNext,
}: CheckCardProps): JSX.Element => {
  const response = useMemo(
    () => responseFor(question, seedKey, siblings, lines),
    [question, seedKey, siblings, lines]
  )
  const [choice, setChoice] = useState<number | null>(null)
  const [placedIds, setPlacedIds] = useState<Array<string>>([])

  const placed = useMemo(
    () =>
      response.channel === "assembly"
        ? placedIds
            .map((id) => response.tiles.find((tile) => tile.id === id))
            .filter((tile): tile is Tile => tile !== undefined)
        : [],
    [response, placedIds]
  )

  const canSubmit =
    answered === null &&
    (response.channel === "selection" ? choice !== null : placed.length > 0)

  const submit = (): void => {
    if (!canSubmit) return
    if (response.channel === "selection") {
      if (choice === null) return
      const picked = response.options[choice] ?? ""
      const correct =
        response.correct !== null
          ? choice === response.correct
          : gradeSelection(picked, question)
      onAnswer(correct, picked, "selection")
    } else {
      const texts = placed.map((tile) => tile.text)
      onAnswer(
        gradeAssembly(texts, question, response.joiner),
        texts.join(response.joiner),
        "assembly"
      )
    }
  }

  // ── Answered: what it was, and the line's gloss, now unlocked ─────────────

  if (answered !== null) {
    const stage = (
      <div
        data-slot="topik-check-feedback"
        className="flex w-full flex-col gap-4"
      >
        <div
          className={cn(
            "flex items-center gap-3 rounded-xl border p-3",
            answered.correct
              ? "bg-success/10 border-success/30"
              : "bg-destructive/10 border-destructive/30"
          )}
        >
          {answered.correct ? (
            <CheckCircle2 className="text-success size-7 shrink-0" />
          ) : (
            <XCircle className="text-destructive size-7 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="font-semibold">
              {answered.correct
                ? "Understood"
                : repeat
                  ? "Still tricky"
                  : "Not quite - it comes back once more"}
            </p>
            {!answered.correct && (
              <p className="text-muted-foreground text-sm break-keep" lang="ko">
                Answer: {question.correctAnswer}
              </p>
            )}
          </div>
        </div>

        {question.explanation && (
          <p className="text-sm leading-relaxed">{question.explanation}</p>
        )}
        {question.grammarNote && (
          <p className="bg-muted/60 rounded-lg p-3 text-sm leading-relaxed">
            {question.grammarNote}
          </p>
        )}
        {anchor && (
          <div className="border-border rounded-lg border p-3">
            <p lang="ko" className="font-semibold break-keep">
              {anchor.korean || anchor.content}
            </p>
            <p className="text-muted-foreground text-sm">{anchor.english}</p>
          </div>
        )}
      </div>
    )
    const dock = (
      <Button className="h-12 w-full gap-2" onClick={onNext}>
        Continue <ChevronRight className="size-5" />
      </Button>
    )
    return <StepLayout short={short} stage={stage} dock={dock} longForm />
  }

  // ── Asking ────────────────────────────────────────────────────────────────

  const stage = (
    <div
      data-slot="topik-check"
      className="flex w-full max-w-md flex-col items-center gap-3 text-center"
    >
      <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
        {repeat ? "Once more" : "About that line"}
      </span>
      <p className={cn("font-semibold", short ? "text-base" : "text-lg")}>
        {question.question}
      </p>
      {question.korean && !excerptRevealsAnswer(question.korean, question) && (
        <p lang="ko" className="text-muted-foreground break-keep">
          {question.korean}
        </p>
      )}
      {audio && anchor && (
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          onClick={onReplayAnchor}
        >
          <Volume2 className={cn("size-4", speaking && "animate-pulse")} /> Hear
          the line
        </Button>
      )}
      {response.channel === "assembly" && (
        <AnswerTray
          placed={placed}
          joiner={response.joiner}
          onRemove={(id) =>
            setPlacedIds((ids) => ids.filter((other) => other !== id))
          }
        />
      )}
    </div>
  )

  const dock =
    response.channel === "selection" ? (
      <>
        <div
          role="radiogroup"
          aria-label="Answers"
          className="flex flex-col gap-2"
        >
          {response.options.map((option, index) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={choice === index}
              onClick={() => setChoice(index)}
              className={cn(
                "min-h-11 rounded-lg border-2 px-3 py-2 text-left text-sm font-medium break-keep transition-colors",
                choice === index
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card"
              )}
            >
              {option}
            </button>
          ))}
        </div>
        <Button className="h-12 w-full" disabled={!canSubmit} onClick={submit}>
          Check
        </Button>
      </>
    ) : (
      <>
        <TilePool
          tiles={response.tiles}
          placedIds={new Set(placedIds)}
          onPlace={(id) => setPlacedIds((ids) => [...ids, id])}
        />
        <div className="flex gap-2">
          <Button
            variant="ghost"
            className="h-12 px-3"
            disabled={placedIds.length === 0}
            onClick={() => setPlacedIds([])}
            aria-label="Clear answer"
          >
            <RotateCcw className="size-5" />
          </Button>
          <Button
            className="h-12 min-w-0 flex-1"
            disabled={!canSubmit}
            onClick={submit}
          >
            Check
          </Button>
        </div>
      </>
    )

  return <StepLayout short={short} stage={stage} dock={dock} />
}
