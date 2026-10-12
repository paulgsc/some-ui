import type { JSX, ReactNode } from "react"
import { useMemo } from "react"
import { assertNever, cn } from "@some-ui/core-utils"
import { isLine } from "@some-ui/makjang"
import type { Beat } from "@some-ui/makjang"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@some-ui/shared"
import type { FeelingKey } from "@some-ui/styles/theme"
import {
  FEELING_CLASS,
  FEELING_MOTION_CLASS,
  FEELING_PANEL_CLASS,
  feelingThemeClass,
  isFeelingKey,
} from "@some-ui/styles/theme"
import { CastFigure } from "@topik/components/topik/handheld/cast-figure"
import { FeelingSymbol } from "@topik/components/topik/handheld/feeling-symbol"
import type { FigureKey } from "@topik/lib/topik/core/cast"
import { nameOf as castName, figuresOf } from "@topik/lib/topik/core/cast"
import type { DramaLesson, Panel, Rung } from "@topik/lib/topik/core/drama"
import { FEELING_WORDS } from "@topik/lib/topik/core/feeling"
import { Ear, Volume2 } from "lucide-react"

type WebtoonPanelProps = {
  panel: Panel
  lesson: DramaLesson
  rungOf: (id: string) => Rung
  onReveal: (id: string) => void
  /** `whyOpen` over this session: the author's notes ask it. */
  whyOpen: (choice: string, option: string) => boolean
  onWhy: (choice: string, option: string) => void
  /** Lines can be heard: a replay button on each. */
  audio: boolean
  speaking: string | null
  onReplay: (beatId: string) => void
}

/**
 * A panel in the scene's feeling (`@some-ui/styles`' `feeling.ts`; MK6), or
 * in the session's own theme when it wears none (`null`).
 */
const Themed = ({
  feeling,
  slot,
  motion = false,
  className,
  children,
}: {
  feeling: FeelingKey | null
  slot: string
  motion?: boolean
  className?: string
  children: ReactNode
}): JSX.Element =>
  feeling === null ? (
    <section
      data-slot={slot}
      className={cn(
        "bg-card text-card-foreground border-border rounded-2xl border-2",
        className
      )}
    >
      {children}
    </section>
  ) : (
    <div
      data-feeling={feeling}
      className={cn(
        FEELING_CLASS,
        feelingThemeClass(feeling),
        motion && FEELING_MOTION_CLASS
      )}
    >
      <section data-slot={slot} className={cn(FEELING_PANEL_CLASS, className)}>
        {children}
      </section>
    </div>
  )

/** Hears a beat again. */
const Replay = ({
  label,
  speaking,
  onReplay,
}: {
  label: string
  speaking: boolean
  onReplay: () => void
}): JSX.Element => (
  <button
    type="button"
    onClick={onReplay}
    aria-label={label}
    className="flex size-11 shrink-0 items-center justify-center"
  >
    <Volume2 className={cn("size-5", speaking && "animate-pulse")} />
  </button>
)

/** A beat's text on its rung: heard only, its Hangul, then its gloss too. */
const Ladder = ({
  rung,
  text,
  gloss,
  note,
  speaking,
  final = false,
  muted,
}: {
  rung: Rung
  text: string
  gloss: string
  /** Shown with the gloss: how a line is said. */
  note?: string
  speaking: boolean
  /** The frame a drama stops on, set larger. */
  final?: boolean
  /** Muted text's colour: the feeling's in a feeling panel (MK5). */
  muted: string
}): JSX.Element =>
  rung === 0 ? (
    <span className={cn(muted, "flex items-center gap-2 text-sm")}>
      <Ear className={cn("size-5 shrink-0", speaking && "animate-pulse")} />
      Listen first. Tap when you want to see it.
    </span>
  ) : (
    <span className="flex flex-col gap-1">
      <span
        lang="ko"
        className={cn(
          "leading-snug font-semibold break-keep",
          final ? "text-xl" : "text-lg"
        )}
      >
        {text}
      </span>
      {rung === 2 && (
        <span className={cn(muted, "text-sm leading-relaxed")}>
          {gloss}
          {note && <span className="block italic">({note})</span>}
        </span>
      )}
    </span>
  )

const mutedIn = (feeling: FeelingKey | null): string =>
  feeling === null ? "text-muted-foreground" : "feeling-muted"

/** The point of view's own line, said aloud, or bitten back in thought. */
export const SPEECH_BUBBLE = "border-primary rounded-2xl rounded-br-sm border-2"
export const THOUGHT_BUBBLE =
  "border-muted-foreground rounded-3xl border-2 border-dashed"

/** The point of view's figure, and a Korean label beside it. */
const PovRow = ({
  figure,
  name,
  tag,
}: {
  figure: FigureKey
  name: string
  tag?: string
}): JSX.Element => (
  <span className="flex flex-row-reverse items-center gap-2">
    <CastFigure figure={figure} speaking={false} className="size-12 shrink-0" />
    <span lang="ko" className="text-sm font-semibold">
      {name}
      {tag && (
        <span className="text-muted-foreground font-normal"> · {tag}</span>
      )}
    </span>
  </span>
)

/**
 * One panel of the webtoon (docs/makjang/README.md, "The webtoon: one feeling
 * per scene").
 */
export const WebtoonPanel = ({
  panel,
  lesson,
  rungOf,
  onReveal,
  whyOpen,
  onWhy,
  audio,
  speaking,
  onReplay,
}: WebtoonPanelProps): JSX.Element | null => {
  const nameOf = (id: string): string => castName(lesson.cast, id)
  const figures = useMemo(() => figuresOf(lesson.cast), [lesson.cast])
  const figureOf = (id: string): FigureKey => figures.get(id) ?? "heart"
  const said = (beat: Beat | undefined): string =>
    beat === undefined
      ? ""
      : isLine(beat)
        ? `${nameOf(beat.speaker)}: ${beat.text}`
        : beat.text

  switch (panel.kind) {
    case "past": {
      const { scene, chosen } = panel
      const feeling = isFeelingKey(scene.feeling)
        ? FEELING_WORDS[scene.feeling].name
        : ""
      return (
        <section
          data-slot="drama-past"
          className="text-muted-foreground flex flex-col gap-1.5 px-1 text-sm"
        >
          <span className="flex items-center gap-2">
            <span className="bg-border h-px min-w-0 flex-1" />
            <span
              lang="ko"
              className="border-border rounded-full border px-2.5 py-0.5 text-xs font-semibold"
            >
              {scene.title ?? scene.place}
              {feeling && ` · ${feeling}`}
            </span>
            <span className="bg-border h-px min-w-0 flex-1" />
          </span>
          {chosen && (
            <span className="self-end text-right break-keep">
              <span lang="ko">
                {nameOf(lesson.pov)}
                {chosen.swallowed && " · 삼킨 말"}:{" "}
              </span>
              <span
                lang="ko"
                className={
                  chosen.swallowed
                    ? "line-through"
                    : "text-foreground font-semibold"
                }
              >
                {chosen.candidate.text}
              </span>
            </span>
          )}
          {scene.beats.map((beat) => (
            <span
              key={beat.id}
              lang="ko"
              className={cn(
                "break-keep",
                isLine(beat) && beat.speaker === lesson.pov
                  ? "self-end text-right"
                  : "",
                isLine(beat) ? "" : "italic"
              )}
            >
              {said(beat)}
            </span>
          ))}
        </section>
      )
    }
    case "resume": {
      return (
        <span
          data-slot="drama-resume"
          lang="ko"
          className="bg-primary text-primary-foreground self-center rounded-full px-3 py-1 text-xs font-semibold"
        >
          여기서부터 이어서
        </span>
      )
    }
    case "cover": {
      const words = FEELING_WORDS[panel.feeling]
      const rung = rungOf(panel.scene.id)
      return (
        <Themed
          feeling={panel.feeling}
          slot="drama-cover"
          motion
          className="flex flex-col items-center gap-2 px-4 py-6 text-center"
        >
          <FeelingSymbol
            feeling={panel.feeling}
            className="feeling-accent size-12"
          />
          <button
            type="button"
            onClick={() => onReveal(panel.scene.id)}
            aria-label={
              rung === 2 ? undefined : `${words.caption}: show English`
            }
            className="flex flex-col items-center gap-1"
          >
            <span lang="ko" className="feeling-caption text-2xl font-black">
              {words.caption}
            </span>
            {rung === 2 && (
              <span className="feeling-muted text-sm">
                {words.captionGloss}
              </span>
            )}
          </button>
          <span
            lang="ko"
            className="feeling-accent text-3xl font-black tracking-widest italic"
          >
            {words.lettering}
          </span>
          <span lang="ko" className="feeling-muted text-xs">
            {panel.scene.place}
          </span>
        </Themed>
      )
    }
    case "line": {
      const { line, feeling } = panel
      const rung = rungOf(line.id)
      const pov = line.speaker === lesson.pov
      const name = nameOf(line.speaker)
      return (
        <Themed
          feeling={feeling}
          slot="drama-line"
          className="flex flex-col gap-2 p-3"
        >
          <span
            className={cn("flex items-center gap-2", pov && "flex-row-reverse")}
          >
            <CastFigure
              figure={figureOf(line.speaker)}
              speaking={speaking === line.id}
              className="size-12 shrink-0"
            />
            <span className="text-sm font-semibold">{name}</span>
            {line.cue && (
              <span lang="ko" className={cn(mutedIn(feeling), "text-xs")}>
                ({line.cue})
              </span>
            )}
            {feeling && (
              <FeelingSymbol
                feeling={feeling}
                className="feeling-accent size-5"
              />
            )}
          </span>
          <span
            className={cn("flex items-start gap-2", pov && "flex-row-reverse")}
          >
            <button
              type="button"
              onClick={() => onReveal(line.id)}
              className={cn(
                "min-w-0 flex-1 rounded-2xl border-2 border-current px-3 py-2",
                pov ? "text-right" : "text-left"
              )}
            >
              <Ladder
                rung={rung}
                text={line.text}
                gloss={line.gloss}
                note={line.direction}
                speaking={speaking === line.id}
                final={panel.final}
                muted={mutedIn(feeling)}
              />
            </button>
            {audio && (
              <Replay
                label={`Play ${name}'s line`}
                speaking={speaking === line.id}
                onReplay={() => onReplay(line.id)}
              />
            )}
          </span>
        </Themed>
      )
    }
    case "narration": {
      const { narration, feeling } = panel
      const rung = rungOf(narration.id)
      return (
        <Themed
          feeling={feeling}
          slot="drama-narration"
          className="flex items-start gap-2 p-3"
        >
          <button
            type="button"
            onClick={() => onReveal(narration.id)}
            className="min-w-0 flex-1 text-left"
          >
            <Ladder
              rung={rung}
              text={narration.text}
              gloss={narration.gloss}
              speaking={speaking === narration.id}
              final={panel.final}
              muted={mutedIn(feeling)}
            />
          </button>
          {audio && (
            <Replay
              label="Play the narration"
              speaking={speaking === narration.id}
              onReplay={() => onReplay(narration.id)}
            />
          )}
          {feeling && (
            <FeelingSymbol
              feeling={feeling}
              className="feeling-accent size-5 shrink-0"
            />
          )}
        </Themed>
      )
    }
    case "chosen": {
      const { candidate, swallowed } = panel.chosen
      return (
        <section
          data-slot="drama-chosen"
          data-swallowed={swallowed || undefined}
          className={cn(
            "text-card-foreground ml-8 flex flex-col gap-2 p-3",
            swallowed ? THOUGHT_BUBBLE : cn("bg-card", SPEECH_BUBBLE)
          )}
        >
          <PovRow
            figure={figureOf(panel.speaker)}
            name={nameOf(panel.speaker)}
            tag={swallowed ? "삼킨 말" : undefined}
          />
          <span
            lang="ko"
            className={cn(
              "text-right text-lg font-semibold break-keep",
              swallowed && "text-muted-foreground line-through"
            )}
          >
            {candidate.text}
          </span>
        </section>
      )
    }
    case "choice": {
      const { choice } = panel.scene
      if (choice === undefined) return null
      const rung = rungOf(choice.id)
      return (
        <section
          data-slot="drama-choice"
          className="bg-card text-card-foreground border-primary ml-6 flex flex-col gap-2 rounded-3xl border-2 border-dashed p-3"
        >
          <PovRow
            figure={figureOf(lesson.pov)}
            name={nameOf(lesson.pov)}
            tag="속마음"
          />
          <button
            type="button"
            onClick={() => onReveal(choice.id)}
            className="flex flex-col gap-1 text-right"
          >
            <span lang="ko" className="text-lg break-keep italic">
              {choice.prompt}
            </span>
            {rung === 2 && (
              <span className="text-muted-foreground text-sm">
                {choice.check.prompt}
              </span>
            )}
          </button>
        </section>
      )
    }
    case "ending": {
      const { hook } = panel.scene
      const hookId = `${panel.scene.id}:hook`
      return (
        <Themed
          feeling={panel.feeling}
          slot="drama-ending"
          className="flex flex-col items-center gap-2 px-4 py-8 text-center"
        >
          <FeelingSymbol
            feeling={panel.feeling}
            className="feeling-accent size-14"
          />
          <span lang="ko" className="text-3xl font-black">
            끝
          </span>
          <span lang="ko" className="feeling-muted text-xs">
            {panel.scene.place}
          </span>
          {hook && (
            <button
              type="button"
              onClick={() => onReveal(hookId)}
              className="mt-2 flex w-full flex-col gap-1 rounded-xl border-2 border-current px-3 py-2 text-left"
            >
              <span lang="ko" className="text-xs font-black">
                다음 화 예고
              </span>
              <span lang="ko" className="text-lg font-semibold break-keep">
                {hook.text}
              </span>
              {rungOf(hookId) === 2 && (
                <span className="feeling-muted text-sm">{hook.gloss}</span>
              )}
            </button>
          )}
        </Themed>
      )
    }
    case "notes": {
      // Folded, so the drama, not its notes, is the last thing on screen.
      return (
        <Accordion
          type="single"
          collapsible
          data-slot="drama-notes"
          className="bg-card text-card-foreground border-border rounded-2xl border px-4"
        >
          <AccordionItem value="notes" className="border-none">
            <AccordionTrigger className="min-h-11 text-sm font-semibold hover:no-underline">
              <span lang="ko">작가의 말</span>
            </AccordionTrigger>
            <AccordionContent>
              <ol className="flex flex-col gap-3">
                {panel.notes.map((note) => (
                  <li
                    key={note.choice}
                    className="border-border flex flex-col gap-1 border-t pt-3"
                  >
                    <span
                      lang="ko"
                      className="text-muted-foreground text-xs font-semibold"
                    >
                      {note.place}
                    </span>
                    <span lang="ko" className="text-sm break-keep">
                      {said(note.trigger)}
                    </span>
                    <span className="font-semibold break-keep">
                      <span lang="ko">
                        {nameOf(lesson.pov)}
                        {note.swallowed && " · 삼킨 말"}:{" "}
                      </span>
                      <span
                        lang="ko"
                        className={cn(note.swallowed && "line-through")}
                      >
                        {note.candidate.text}
                      </span>
                    </span>
                    <span lang="ko" className="text-sm break-keep">
                      → {said(note.reaction)}
                    </span>
                    {whyOpen(note.choice, note.candidate.id) ? (
                      <span className="text-muted-foreground text-sm">
                        {note.candidate.why}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onWhy(note.choice, note.candidate.id)}
                        className="text-muted-foreground min-h-11 self-start text-sm underline"
                      >
                        Why?
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )
    }
    default: {
      return assertNever(panel)
    }
  }
}
