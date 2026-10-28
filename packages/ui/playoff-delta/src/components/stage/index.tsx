import {
  useEffect,
  useMemo,
  useReducer,
  type CSSProperties,
  type JSX,
} from "react"
import { LEGEND, SLIDES } from "@playoff-delta/components/slides"
import { clampSlide, initialPlayer, step } from "@playoff-delta/lib/player"
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import {
  HOLD_MS,
  isLegendSlide,
  LEGEND_SLIDES,
  LEGEND_WEEK,
  legendLine,
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

/** The slide `id` names: the legend's, or one of the week's. */
const SlideAt = ({
  season,
  week,
  id,
}: {
  season: StorySeason
  week: StoryWeek | null
  id: SlideId
}): JSX.Element | null => {
  if (isLegendSlide(id)) {
    const Slide = LEGEND[id]
    return <Slide />
  }
  if (week === null) return null
  const Slide = SLIDES[id]
  return <Slide season={season} week={week} />
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
  /** Null for the legend. */
  week: StoryWeek | null
  ids: ReadonlyArray<SlideId>
  at: number
  running: boolean
  fill: boolean
  /** Record mode: the week, its slides, holds and voiceover, for the recorder. */
  script?: string
  onBack?: () => void
  onNext?: () => void
}): JSX.Element => {
  const id = ids[at] ?? ids[0] ?? "legend"
  return (
    <div
      className={`pd-frame bg-background text-foreground ${fill ? "pd-frame--fill" : "border-border h-full max-w-full rounded-[calc(var(--radius)+0.75rem)] border"}`}
      data-slide={id}
      data-pd-script={script}
    >
      <Segments ids={ids} at={at} running={running} />
      <div className="pd-meta">
        <span>
          {week === null ? "THE LEGEND" : `WEEK ${week.week}`} · {season.team}
        </span>
        <span>{season.label}</span>
      </div>
      {/* keyed by slide so every reveal replays when the slide changes */}
      <div key={`${week?.week ?? LEGEND_WEEK}-${id}`} className="pd-slide">
        <SlideAt season={season} week={week} id={id} />
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

/** The voiceover line for one slide of an episode. */
const lineOf = (
  season: StorySeason,
  week: StoryWeek | null,
  id: SlideId
): string =>
  isLegendSlide(id)
    ? legendLine(id)
    : week === null
      ? ""
      : narration(season, week, id)

/** One episode's story (a week, or the legend); keyed by it, so a new one starts from its first slide. */
const WeekStory = ({
  season,
  week,
  initialSlide,
  record,
  onWeekChange,
}: {
  season: StorySeason
  /** Null for the legend. */
  week: StoryWeek | null
  initialSlide: number
  record: boolean
  onWeekChange?: (week: number) => void
}): JSX.Element => {
  const ids: ReadonlyArray<SlideId> = useMemo(
    () => (week === null ? LEGEND_SLIDES : slidesFor(week)),
    [week]
  )
  const count = ids.length
  const [player, dispatch] = useReducer(
    step,
    initialPlayer(count, initialSlide)
  )
  // Recording follows the address; playing follows the player.
  const at = clampSlide(count, record ? initialSlide : player.slide)

  // The one timer: while playing, the current slide holds, then advances.
  useEffect(() => {
    if (!player.playing || record) return
    const slide = player.slide
    const id = ids[slide]
    if (!id) return
    const t = setTimeout(
      () => dispatch({ type: "elapsed", slide, count: ids.length }),
      HOLD_MS[id]
    )
    return (): void => clearTimeout(t)
  }, [player.playing, player.slide, ids, record])

  useEffect(() => {
    if (record) return
    const onKey = (e: KeyboardEvent): void => {
      // A focused control keeps its own keys; Space on a button presses it.
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if (
        e.target instanceof Element &&
        e.target.closest("button, select, input, textarea, a")
      )
        return
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault()
        dispatch({ type: "next", count })
      }
      if (e.key === "ArrowLeft") dispatch({ type: "back" })
    }
    window.addEventListener("keydown", onKey)
    return (): void => window.removeEventListener("keydown", onKey)
  }, [record, count])

  if (record)
    return (
      <Frame
        season={season}
        week={week}
        ids={ids}
        at={at}
        running={false}
        fill
        script={JSON.stringify({
          week: week?.week ?? LEGEND_WEEK,
          slides: ids.map((slide) => ({
            slide,
            holdMs: HOLD_MS[slide],
            line: lineOf(season, week, slide),
          })),
        })}
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
            value={week?.week ?? LEGEND_WEEK}
            onChange={(e) => onWeekChange?.(Number(e.target.value))}
          >
            <option value={LEGEND_WEEK}>The legend</option>
            {season.weeks.map((w) => (
              <option key={w.week} value={w.week}>
                Week {w.week}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="bg-primary text-primary-foreground rounded-md px-3 py-1 text-sm font-semibold"
            onClick={() => dispatch({ type: "toggle", count })}
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
          at={at}
          running={player.playing}
          fill={false}
          onBack={() => dispatch({ type: "back" })}
          onNext={() => dispatch({ type: "next", count })}
        />
      </div>
    </div>
  )
}

/**
 * The story for one team's season (the bundled sample until a real feed is
 * passed in), a week at a time, as a 9:16 stage meant to be screen-recorded.
 * Week `LEGEND_WEEK` (0) is the legend episode, which teaches the words every
 * week then uses.
 * `record` renders the one slide `initialSlide` names, filling the viewport,
 * with nothing to press: the recorder sizes the viewport (1080x1920) and
 * captures it.
 */
export const PlayoffDeltaStage = ({
  season = SAMPLE_SEASON,
  week,
  initialSlide = 0,
  record = false,
  onWeekChange,
}: {
  season?: StorySeason
  /** The week to show (0: the legend); the first in the season when absent or unknown. */
  week?: number
  initialSlide?: number
  record?: boolean
  onWeekChange?: (week: number) => void
}): JSX.Element | null => {
  if (week === LEGEND_WEEK)
    return (
      <WeekStory
        key={LEGEND_WEEK}
        season={season}
        week={null}
        initialSlide={initialSlide}
        record={record}
        onWeekChange={onWeekChange}
      />
    )
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
