import type { JSX, ReactNode } from "react"
import { assertNever, cn } from "@some-ui/core-utils"
import type { FeelingKey } from "@some-ui/styles/theme"
import {
  FEELING_CLASS,
  FEELING_MOTION_CLASS,
  FEELING_PANEL_CLASS,
  feelingThemeClass,
} from "@some-ui/styles/theme"
import { FeelingSymbol } from "@topik/components/topik/handheld/feeling-symbol"
import type { DramaLesson, Panel, Rung } from "@topik/lib/topik/core/drama"
import { FEELING_WORDS } from "@topik/lib/topik/core/feeling"
import { Ear, Volume2 } from "lucide-react"

type WebtoonPanelProps = {
  panel: Panel
  lesson: DramaLesson
  rungOf: (id: string) => Rung
  onReveal: (id: string) => void
  /** Lines can be heard: a replay button on each. */
  audio: boolean
  speaking: string | null
  onReplay: (beatId: string) => void
}

/** A panel in the scene's feeling (`@some-ui/styles`' `feeling.ts`; MK6). */
const Themed = ({
  feeling,
  slot,
  motion = false,
  className,
  children,
}: {
  feeling: FeelingKey
  slot: string
  motion?: boolean
  className?: string
  children: ReactNode
}): JSX.Element => (
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

/** A speaker's initial in a ring, as a webtoon marks who is talking. */
const Initial = ({ name }: { name: string }): JSX.Element => (
  <span
    aria-hidden="true"
    className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-current text-sm font-bold"
  >
    {name.slice(0, 1)}
  </span>
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
}: {
  rung: Rung
  text: string
  gloss: string
  /** Shown with the gloss: how a line is said. */
  note?: string
  speaking: boolean
}): JSX.Element =>
  rung === 0 ? (
    <span className="feeling-muted flex items-center gap-2 text-sm">
      <Ear className={cn("size-5 shrink-0", speaking && "animate-pulse")} />
      Listen first. Tap when you want to see it.
    </span>
  ) : (
    <span className="flex flex-col gap-1">
      <span lang="ko" className="text-lg leading-snug font-semibold break-keep">
        {text}
      </span>
      {rung === 2 && (
        <span className="feeling-muted text-sm leading-relaxed">
          {gloss}
          {note && <span className="block italic">({note})</span>}
        </span>
      )}
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
  audio,
  speaking,
  onReplay,
}: WebtoonPanelProps): JSX.Element | null => {
  const nameOf = (id: string): string =>
    lesson.cast.find((character) => character.id === id)?.name ?? id

  switch (panel.kind) {
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
      const { line } = panel
      const rung = rungOf(line.id)
      const pov = line.speaker === lesson.pov
      const name = nameOf(line.speaker)
      return (
        <Themed
          feeling={panel.feeling}
          slot="drama-line"
          className="flex flex-col gap-2 p-3"
        >
          <span
            className={cn("flex items-center gap-2", pov && "flex-row-reverse")}
          >
            <Initial name={name} />
            <span className="text-sm font-semibold">{name}</span>
            <FeelingSymbol
              feeling={panel.feeling}
              className="feeling-accent size-5"
            />
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
      const { narration } = panel
      const rung = rungOf(narration.id)
      return (
        <Themed
          feeling={panel.feeling}
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
            />
          </button>
          {audio && (
            <Replay
              label="Play the narration"
              speaking={speaking === narration.id}
              onReplay={() => onReplay(narration.id)}
            />
          )}
          <FeelingSymbol
            feeling={panel.feeling}
            className="feeling-accent size-5 shrink-0"
          />
        </Themed>
      )
    }
    case "chosen": {
      const { candidate, choice } = panel.chosen
      const why = `${choice}:why`
      return (
        <section
          data-slot="drama-chosen"
          className="bg-card text-card-foreground border-primary ml-8 flex flex-col gap-2 rounded-2xl border-4 border-double p-3"
        >
          <span className="flex flex-row-reverse items-center gap-2">
            <Initial name={nameOf(panel.speaker)} />
            <span className="text-sm font-semibold">
              {nameOf(panel.speaker)}
            </span>
          </span>
          <span
            lang={candidate.lang === "en" ? "en" : "ko"}
            className="text-right text-lg font-semibold break-keep"
          >
            {candidate.text}
          </span>
          {rungOf(why) === 2 ? (
            <span className="text-muted-foreground text-right text-sm">
              {candidate.why}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onReveal(why)}
              className="text-muted-foreground self-end text-sm underline"
            >
              Why?
            </button>
          )}
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
          className="bg-card text-card-foreground border-border flex flex-col gap-2 rounded-2xl border p-4"
        >
          <button
            type="button"
            onClick={() => onReveal(choice.id)}
            className="flex flex-col gap-1 text-left"
          >
            <span lang="ko" className="text-lg font-semibold break-keep">
              {choice.prompt}
            </span>
            {rung === 2 && (
              <span className="text-muted-foreground text-sm">
                {choice.check.prompt}
              </span>
            )}
          </button>
          {choice.check.source && (
            <span lang="ko" className="text-muted-foreground break-keep">
              “{choice.check.source}”
            </span>
          )}
        </section>
      )
    }
    case "ending": {
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
        </Themed>
      )
    }
    default: {
      return assertNever(panel)
    }
  }
}
