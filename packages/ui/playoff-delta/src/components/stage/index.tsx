import {
  useEffect,
  useMemo,
  useReducer,
  type CSSProperties,
  type JSX,
} from "react"
import { SLIDES } from "@playoff-delta/components/slides"
import { initialPlayer, step } from "@playoff-delta/lib/player"
import {
  HOLD_MS,
  narration,
  slidesFor,
  type SlideId,
} from "@playoff-delta/lib/slides"
import type { StorySeason, StoryWeek } from "@playoff-delta/lib/story"

import "./index.css"

const Segments = ({
  ids,
  at,
  running,
}: {
  ids: ReadonlyArray<SlideId>
  at: number
  running: boolean
}): JSX.Element => {
  return (
    <div className="pd-segs" aria-hidden="true">
      {ids.map((id, i) => {
        const style: CSSProperties & Record<"--pd-hold", string> = {
          "--pd-hold": `${HOLD_MS[id]}ms`,
        }
        const cls =
          i < at
            ? "pd-seg--done"
            : i === at
              ? running
                ? "pd-seg--run"
                : "pd-seg--now"
              : ""
        return (
          <div key={id} className={`pd-seg ${cls}`} style={style}>
            <i />
          </div>
        )
      })}
    </div>
  )
}

const Frame = ({
  season,
  week,
  ids,
  at,
  running,
  fill,
  script,
  onBack,
  onNext,
}: {
  season: StorySeason
  week: StoryWeek
  ids: ReadonlyArray<SlideId>
  at: number
  running: boolean
  fill: boolean
  /** Record mode: the week's slides, holds and voiceover, for the recorder. */
  script?: string
  onBack?: () => void
  onNext?: () => void
}): JSX.Element => {
  const id = ids[at] ?? ids[0] ?? "hook"
  const Slide = SLIDES[id]
  return (
    <div
      className={`pd-frame bg-background text-foreground ${fill ? "pd-frame--fill" : "border-border h-full max-w-full rounded-[calc(var(--radius)+0.75rem)] border"}`}
      data-slide={id}
      data-pd-script={script}
    >
      <Segments ids={ids} at={at} running={running} />
      <div className="pd-meta">
        <span>
          WEEK {week.week} · {season.team}
        </span>
        <span>{season.label}</span>
      </div>
      {/* keyed by slide so every reveal replays when the slide changes */}
      <div key={`${week.week}-${id}`} className="pd-slide">
        <Slide season={season} week={week} />
      </div>
      {onBack && onNext ? (
        <div className="absolute inset-0 z-[1] grid grid-cols-[1fr_2fr]">
          <button type="button" aria-label="Previous slide" onClick={onBack} />
          <button type="button" aria-label="Next slide" onClick={onNext} />
        </div>
      ) : null}
    </div>
  )
}

/** One week's story; keyed by week, so a new week starts from its first slide. */
const WeekStory = ({
  season,
  week,
  initialSlide,
  record,
  onWeekChange,
}: {
  season: StorySeason
  week: StoryWeek
  initialSlide: number
  record: boolean
  onWeekChange?: (week: number) => void
}): JSX.Element => {
  const ids = useMemo(() => slidesFor(week), [week])
  const [player, dispatch] = useReducer(
    step,
    initialPlayer(ids.length, initialSlide)
  )

  // The one timer: while playing, the current slide holds, then advances.
  useEffect(() => {
    if (!player.playing || record) return
    const slide = player.slide
    const id = ids[slide]
    if (!id) return
    const t = setTimeout(
      () => dispatch({ type: "elapsed", slide }),
      HOLD_MS[id]
    )
    return (): void => clearTimeout(t)
  }, [player.playing, player.slide, ids, record])

  useEffect(() => {
    if (record) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLSelectElement) return
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault()
        dispatch({ type: "next" })
      }
      if (e.key === "ArrowLeft") dispatch({ type: "back" })
    }
    window.addEventListener("keydown", onKey)
    return (): void => window.removeEventListener("keydown", onKey)
  }, [record])

  if (record)
    return (
      <Frame
        season={season}
        week={week}
        ids={ids}
        at={player.slide}
        running={false}
        fill
        script={JSON.stringify(
          ids.map((slide) => ({
            slide,
            holdMs: HOLD_MS[slide],
            line: narration(season, week, slide),
          }))
        )}
      />
    )

  return (
    <div className="bg-background text-foreground flex h-dvh flex-col items-center gap-3 px-4 py-3">
      <div className="flex w-full max-w-3xl flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">
          Playoff Delta
          <span className="text-muted-foreground block text-xs font-normal">
            {season.label} · record the frame
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Week"
            className="border-border bg-card rounded-md border px-2 py-1 text-sm"
            value={week.week}
            onChange={(e) => onWeekChange?.(Number(e.target.value))}
          >
            {season.weeks.map((w) => (
              <option key={w.week} value={w.week}>
                Week {w.week}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="bg-primary text-primary-foreground rounded-md px-3 py-1 text-sm font-semibold"
            onClick={() => dispatch({ type: "toggle" })}
          >
            {player.playing ? "Pause" : "Play"}
          </button>
        </div>
      </div>
      <div className="flex min-h-0 w-full flex-1 justify-center">
        <Frame
          season={season}
          week={week}
          ids={ids}
          at={player.slide}
          running={player.playing}
          fill={false}
          onBack={() => dispatch({ type: "back" })}
          onNext={() => dispatch({ type: "next" })}
        />
      </div>
    </div>
  )
}

/**
 * The story for one team's season, a week at a time, as a 9:16 stage meant to
 * be screen-recorded. `record` renders the one slide `initialSlide` names,
 * filling the viewport, with nothing to press: the recorder sizes the
 * viewport (1080x1920) and captures it.
 */
export const PlayoffDeltaStage = ({
  season,
  week,
  initialSlide = 0,
  record = false,
  onWeekChange,
}: {
  season: StorySeason
  /** The week to show; the first in the season when absent or unknown. */
  week?: number
  initialSlide?: number
  record?: boolean
  onWeekChange?: (week: number) => void
}): JSX.Element | null => {
  const shown = season.weeks.find((w) => w.week === week) ?? season.weeks[0]
  if (!shown) return null
  return (
    <WeekStory
      key={shown.week}
      season={season}
      week={shown}
      initialSlide={initialSlide}
      record={record}
      onWeekChange={onWeekChange}
    />
  )
}
