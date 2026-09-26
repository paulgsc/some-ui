/**
 * A morphism probe on a phone (adaptive-learning canon Def. 4.6, Cor. 4.5).
 *
 * Never "what does this mean?" - a single recognised noun answers that
 * (Prop. 4.2). Instead the learner judges transformations of the line they
 * just heard: which of these is not a valid past tense / negation / reply,
 * which reply fits, or builds the negation from tiles. Candidates are shown as
 * diffs against the source, so the eye goes to the morphology; the feedback
 * then walks every candidate with its verdict and reason, so one probe teaches
 * the whole family of relations rather than one right answer.
 */

import type { JSX, ReactNode } from "react"
import { useMemo, useState } from "react"
import { Button } from "@some-ui/shared"
import { DiffText } from "@topik/components/topik/handheld/diff-text"
import { StepLayout } from "@topik/components/topik/handheld/step-layout"
import type { Tile } from "@topik/components/topik/handheld/tile-board"
import {
  AnswerTray,
  TilePool,
  toTiles,
} from "@topik/components/topik/handheld/tile-board"
import type { Message, Probe, ProbeOption } from "@topik/lib/topik"
import type {
  CheckOutcome,
  ResponseChannel,
} from "@topik/lib/topik/core/lesson-track"
import {
  acceptedForms,
  isCorrectChoice,
  kindLabel,
  orderedOptions,
  orderLabel,
  relationLabel,
  showsRelations,
} from "@topik/lib/topik/core/probe"
import {
  buildTileBoard,
  excerptRevealsAnswer,
  gradeAssembly,
} from "@topik/lib/topik/core/tile-assembly"
import {
  Check,
  CheckCircle2,
  ChevronRight,
  RotateCcw,
  Volume2,
  XCircle,
} from "lucide-react"
import { cn } from "some-ui-utils"

type ProbeCardProps = {
  probe: Probe
  /** The utterance under test: the probe's own, else its line's Korean. */
  source: string
  /** Seeds option order and the tile board, stable across resumes. */
  seedKey: string
  /** The line this probe is about. */
  anchor: Message | undefined
  /** The conversation's lines, for tile distractors. */
  lines: Array<Message>
  answered: CheckOutcome | null
  /** Whether the anchor line's gloss may show yet (all its probes answered). */
  showGloss: boolean
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

const Chip = ({
  children,
  tone = "muted",
}: {
  children: ReactNode
  tone?: "muted" | "primary"
}): JSX.Element => (
  <span
    className={cn(
      "rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase",
      tone === "primary"
        ? "bg-primary/15 text-primary"
        : "bg-muted text-muted-foreground"
    )}
  >
    {children}
  </span>
)

/** A candidate as it reads in a list: its relation, then the text itself. */
const CandidateText = ({
  option,
  source,
  withRelation,
}: {
  option: ProbeOption
  source: string
  withRelation: boolean
}): JSX.Element => (
  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
    {withRelation && (
      <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {relationLabel(option.relation, option.label)}
      </span>
    )}
    {option.lang === "en" ? (
      <span>{option.text}</span>
    ) : (
      <DiffText source={source} candidate={option.text} />
    )}
  </span>
)

export const ProbeCard = ({
  probe,
  source,
  seedKey,
  anchor,
  lines,
  answered,
  showGloss,
  repeat,
  audio,
  speaking,
  short,
  onReplayAnchor,
  onAnswer,
  onNext,
}: ProbeCardProps): JSX.Element => {
  const choice = probe.kind === "build" ? null : probe
  const options = useMemo(
    () => (choice ? orderedOptions(choice, seedKey) : []),
    [choice, seedKey]
  )
  const board = useMemo(
    () =>
      probe.kind === "build"
        ? buildTileBoard(
            acceptedForms(probe),
            seedKey,
            lines.map((line) => line.korean || line.content),
            { distractors: probe.distractors, distractorCount: 3 }
          )
        : null,
    [probe, seedKey, lines]
  )
  const tiles = useMemo(() => (board ? toTiles(board.tiles) : []), [board])

  const [picked, setPicked] = useState<number | null>(null)
  const [placedIds, setPlacedIds] = useState<Array<string>>([])
  const placed = placedIds
    .map((id) => tiles.find((tile) => tile.id === id))
    .filter((tile): tile is Tile => tile !== undefined)

  const canSubmit =
    answered === null &&
    (choice ? picked !== null : board !== null && placed.length > 0)

  const submit = (): void => {
    if (!canSubmit) return
    if (choice) {
      const option = picked === null ? undefined : options[picked]
      if (!option) return
      onAnswer(isCorrectChoice(choice, option), option.text, "selection")
      return
    }
    if (probe.kind === "build" && board) {
      const texts = placed.map((tile) => tile.text)
      onAnswer(
        gradeAssembly(texts, acceptedForms(probe), board.joiner),
        texts.join(board.joiner),
        "assembly"
      )
    }
  }

  // The source is always shown - it is what every candidate is judged
  // against - unless it would give a build probe's answer away (Prop. 3.1).
  const showSource =
    source !== "" &&
    !(
      probe.kind === "build" &&
      excerptRevealsAnswer(source, acceptedForms(probe))
    )

  const sourceCard = showSource && (
    <div className="bg-muted/50 flex w-full items-center gap-2 rounded-2xl px-4 py-3">
      <p
        lang="ko"
        className={cn(
          "min-w-0 flex-1 font-semibold break-keep",
          short ? "text-base" : "text-lg"
        )}
      >
        {source}
      </p>
      {audio && anchor && (
        <Button
          variant="ghost"
          size="icon"
          className="size-10 shrink-0 rounded-full"
          onClick={onReplayAnchor}
          aria-label="Hear the line"
        >
          <Volume2 className={cn("size-5", speaking && "animate-pulse")} />
        </Button>
      )}
    </div>
  )

  const tags = (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      <Chip tone="primary">{repeat ? "Once more" : kindLabel(probe.kind)}</Chip>
      <Chip>{orderLabel(probe.order)}</Chip>
      {probe.kind === "build" && <Chip>{relationLabel(probe.relation)}</Chip>}
    </div>
  )

  // ── Answered: every candidate, with its verdict and why ──────────────────

  if (answered !== null) {
    const withRelation = choice ? showsRelations(choice) : false
    const stage = (
      <div
        data-slot="topik-probe-feedback"
        className="flex w-full flex-col gap-3"
      >
        <div
          className={cn(
            "flex items-center gap-3 rounded-2xl border p-3",
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
          <p className="font-semibold">
            {answered.correct
              ? "Right"
              : repeat
                ? "Still tricky"
                : "Not quite - it comes back once more"}
          </p>
        </div>

        {sourceCard}

        {choice ? (
          <ul className="flex flex-col gap-2">
            {options.map((option, index) => {
              const chosen = picked === index
              return (
                <li
                  key={option.text}
                  data-valid={option.valid}
                  className={cn(
                    "rounded-2xl border p-3",
                    chosen ? "border-primary/50" : "border-border"
                  )}
                >
                  <div className="flex items-start gap-2">
                    {option.valid ? (
                      <CheckCircle2
                        aria-label="Holds"
                        className="text-success mt-0.5 size-4 shrink-0"
                      />
                    ) : (
                      <XCircle
                        aria-label="Does not hold"
                        className="text-destructive mt-0.5 size-4 shrink-0"
                      />
                    )}
                    <CandidateText
                      option={option}
                      source={source}
                      withRelation={withRelation}
                    />
                    {chosen && <Chip>Your pick</Chip>}
                  </div>
                  <p className="text-muted-foreground mt-1.5 pl-6 text-sm leading-snug">
                    {option.why}
                  </p>
                </li>
              )
            })}
          </ul>
        ) : (
          probe.kind === "build" && (
            <div className="border-border rounded-2xl border p-3">
              <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                {relationLabel(probe.relation)}
              </p>
              <DiffText
                source={source}
                candidate={probe.target}
                className="font-semibold"
              />
              {!answered.correct && (
                <p className="text-muted-foreground mt-1 text-sm break-keep">
                  You built: {answered.response}
                </p>
              )}
            </div>
          )
        )}

        {probe.explanation && (
          <p className="text-sm leading-relaxed">{probe.explanation}</p>
        )}

        {anchor && (
          <div className="bg-muted/40 rounded-2xl p-3">
            <p lang="ko" className="font-medium break-keep">
              {anchor.korean || anchor.content}
            </p>
            {showGloss ? (
              <p className="text-muted-foreground text-sm">{anchor.english}</p>
            ) : (
              <p className="text-muted-foreground text-xs">
                English unlocks after the other question about this line.
              </p>
            )}
          </div>
        )}
      </div>
    )
    const dock = (
      <Button className="h-12 w-full gap-2 rounded-2xl" onClick={onNext}>
        Continue <ChevronRight className="size-5" />
      </Button>
    )
    return <StepLayout short={short} stage={stage} dock={dock} longForm />
  }

  // ── Asking ────────────────────────────────────────────────────────────────

  const stage = (
    <div
      data-slot="topik-probe"
      data-kind={probe.kind}
      className="flex w-full max-w-md flex-col items-center gap-3 text-center"
    >
      {tags}
      <p className={cn("font-semibold", short ? "text-base" : "text-lg")}>
        {probe.prompt}
      </p>
      {sourceCard}
      {board && (
        <AnswerTray
          placed={placed}
          joiner={board.joiner}
          onRemove={(id) =>
            setPlacedIds((ids) => ids.filter((other) => other !== id))
          }
        />
      )}
    </div>
  )

  const dock = choice ? (
    <>
      <div
        role="radiogroup"
        aria-label="Candidates"
        className="flex flex-col gap-2"
      >
        {options.map((option, index) => (
          <button
            key={option.text}
            type="button"
            role="radio"
            aria-checked={picked === index}
            onClick={() => setPicked(index)}
            className={cn(
              "flex min-h-12 items-center gap-3 rounded-2xl border px-4 py-2 text-left text-sm font-medium transition-colors",
              picked === index
                ? "border-primary/40 bg-primary/15"
                : "border-border bg-card"
            )}
          >
            <CandidateText
              option={option}
              source={source}
              withRelation={showsRelations(choice)}
            />
            {picked === index && (
              <Check className="text-primary size-4 shrink-0" />
            )}
          </button>
        ))}
      </div>
      <Button
        className="h-12 w-full rounded-2xl"
        disabled={!canSubmit}
        onClick={submit}
      >
        Check
      </Button>
    </>
  ) : (
    <>
      <TilePool
        tiles={tiles}
        placedIds={new Set(placedIds)}
        onPlace={(id) => setPlacedIds((ids) => [...ids, id])}
      />
      <div className="flex gap-2">
        <Button
          variant="ghost"
          className="h-12 rounded-2xl px-3"
          disabled={placedIds.length === 0}
          onClick={() => setPlacedIds([])}
          aria-label="Clear answer"
        >
          <RotateCcw className="size-5" />
        </Button>
        <Button
          className="h-12 min-w-0 flex-1 rounded-2xl"
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
