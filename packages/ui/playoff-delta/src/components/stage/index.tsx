import { useEffect, useReducer, type CSSProperties, type JSX } from "react"
import { LEGEND, SLIDES } from "@playoff-delta/components/slides"
import { clampSlide, initialPlayer, step } from "@playoff-delta/lib/player"
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import {
  formatOf,
  kindOf,
  RECORDING,
  versionRefusal,
} from "@playoff-delta/lib/show"
import {
  HOLD_MS,
  isLegendSlide,
  LEGEND_WEEK,
  slidesOf,
  type SlideId,
} from "@playoff-delta/lib/slides"
import { seasonData } from "@playoff-delta/lib/story"
import type { StorySeason, StoryWeek } from "@playoff-delta/lib/story"
import {
  introOf,
  voicedSceneOf,
  type VoicedScene,
} from "@playoff-delta/lib/voiced"
import { INTRO } from "@playoff-delta/lib/words"
import { captionSpace } from "@some-ui/burn-ins"
import { cn } from "@some-ui/core-utils"
import { assertNever } from "@some-ui/intent-kit"
import { useOverflows } from "@some-ui/react-hooks"
import { BrandMark } from "@some-ui/shared"
import { sessionThemeProps } from "@some-ui/styles/theme"
import { hasCaptions, markThemeOf } from "@some-ui/video-render"
import type { Shape } from "@some-ui/video-render"

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
    return <Slide season={season} />
  }
  if (week === null) return null
  const Slide = SLIDES[id]
  return <Slide season={season} week={week} />
}

/** A scene the shape adds around the slides: the intro, a brand slide or a chapter. */
type Framing = Exclude<VoicedScene, { kind: "slide" }>

/** The intro, a brand slide or a chapter slide, drawn as a slide is. */
const FramingSlide = ({
  season,
  week,
  version,
  shape,
  scene,
}: {
  season: StorySeason
  week: StoryWeek | null
  version: number
  /** The format version's shape, which names the mark's theme. */
  shape: Shape | undefined
  scene: Framing
}): JSX.Element => {
  switch (scene.kind) {
    case "intro": {
      const intro = introOf(season, week?.week ?? LEGEND_WEEK, version)
      return (
        <div className="flex h-full flex-col justify-center gap-[5cqw]">
          <p className="pd-kicker">{INTRO.title}</p>
          <dl className="pd-say flex flex-col gap-[3cqw]">
            {intro.rows.map((row) => (
              <div key={row.label}>
                <dt className="pd-small text-muted-foreground">{row.label}</dt>
                <dd className="font-semibold">{row.says}</dd>
              </div>
            ))}
          </dl>
        </div>
      )
    }
    case "brand-in":
    case "brand-out": {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-[4cqw]">
          <BrandMark
            tone="brand"
            className="size-[40cqw]"
            title={INTRO.mark}
            theme={markThemeOf(shape)}
          />
          <p className="pd-q text-center">{INTRO.show}</p>
          {scene.kind === "brand-out" && (
            <p className="pd-small pd-mono text-muted-foreground text-center">
              {INTRO.source}
            </p>
          )}
        </div>
      )
    }
    case "chapter": {
      return (
        <div className="flex h-full flex-col justify-center">
          <p className="pd-big">{scene.said.replace(/\.$/, "")}</p>
        </div>
      )
    }
    default: {
      return assertNever(scene)
    }
  }
}

const Frame = ({
  season,
  week,
  ids,
  at,
  running,
  fill,
  data,
  framing,
  version,
  band = false,
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
  /**
   * Record mode: the season the frame plays, for the recorder, which makes
   * the episode from it (`lib/show`) and sums its bytes.
   */
  data?: string
  framing?: Framing
  /** The format version recorded, for the intro to name. */
  version?: number
  /** Record mode with captions: the band at the foot is left empty for them. */
  band?: boolean
  onBack?: () => void
  onNext?: () => void
}): JSX.Element => {
  const id = ids[at] ?? ids[0] ?? "legend"
  const shown = framing?.id ?? id
  const { ref, overflows } = useOverflows(
    `${week?.week ?? LEGEND_WEEK}-${shown}`
  )
  // The band's height is a share of the frame's, the container's height
  // unit; it runs to the frame's foot.
  const style: CSSProperties | undefined = band
    ? {
        paddingBottom: `${(100 * captionSpace(RECORDING)) / RECORDING.height}cqh`,
      }
    : undefined
  const brand = framing?.kind === "brand-in" || framing?.kind === "brand-out"
  const shape =
    version === undefined
      ? undefined
      : formatOf(kindOf(week?.week ?? LEGEND_WEEK), version).shape
  return (
    <div
      {...sessionThemeProps(shape?.theme, {
        className: cn(
          "pd-frame bg-background text-foreground",
          fill
            ? "pd-frame--fill"
            : "border-border h-full max-w-full rounded-[calc(var(--radius)+0.75rem)] border"
        ),
      })}
      data-slide={shown}
      data-pd-season={data}
      data-overflow={overflows ? "true" : undefined}
    >
      {framing === undefined && (
        <Segments ids={ids} at={at} running={running} />
      )}
      {!brand && (
        <div className="pd-meta">
          <span>
            {week === null ? "THE LEGEND" : `WEEK ${week.week}`} · {season.team}
          </span>
          <span>{season.label}</span>
        </div>
      )}
      {/* keyed by slide so every reveal replays when the slide changes */}
      <div
        key={`${week?.week ?? LEGEND_WEEK}-${shown}`}
        ref={ref}
        className="pd-slide"
        style={style}
      >
        {framing === undefined ? (
          <SlideAt season={season} week={week} id={id} />
        ) : (
          <FramingSlide
            season={season}
            week={week}
            version={version ?? 1}
            shape={shape}
            scene={framing}
          />
        )}
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

/** One episode's story (a week, or the legend); keyed by it, so a new one starts from its first slide. */
const WeekStory = ({
  season,
  week,
  initialSlide,
  record,
  scene,
  version,
  onWeekChange,
}: {
  season: StorySeason
  /** Null for the legend. */
  week: StoryWeek | null
  initialSlide: number
  record: boolean
  scene?: string
  version?: number
  onWeekChange?: (week: number) => void
}): JSX.Element => {
  const ids = slidesOf(week === null ? "legend" : "week")
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

  if (record) {
    const n = week?.week ?? LEGEND_WEEK
    const named =
      version !== undefined && scene !== undefined
        ? voicedSceneOf(season, n, version, scene)
        : undefined

    return (
      <Frame
        season={season}
        week={week}
        ids={ids}
        at={named?.kind === "slide" ? named.slide : at}
        running={false}
        fill
        data={seasonData(season)}
        framing={named?.kind === "slide" ? undefined : named}
        version={version}
        band={
          version !== undefined && hasCaptions(formatOf(kindOf(n), version))
        }
      />
    )
  }

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
 * captures it. With `version` (2 on, FEED3) it draws that format version's
 * shape: `scene` names the slide, the intro, a brand slide or a chapter
 * (`lib/voiced`), and the band at the foot is left empty for captions.
 */
export const PlayoffDeltaStage = ({
  season = SAMPLE_SEASON,
  week,
  initialSlide = 0,
  record = false,
  scene,
  version,
  onWeekChange,
}: {
  season?: StorySeason
  /** The week to show (0: the legend); the first in the season when absent or unknown. */
  week?: number
  initialSlide?: number
  record?: boolean
  /** Record mode: the scene of the shape, by its id. */
  scene?: string
  /** Record mode: the format version whose shape is drawn. */
  version?: number
  onWeekChange?: (week: number) => void
}): JSX.Element | null => {
  // VS1 (#2796): a version newer than this stage knows is refused on the
  // frame, where the recorder reads it, never drawn in an older look.
  const refused =
    version === undefined
      ? null
      : versionRefusal(kindOf(week ?? season.weeks[0]?.week ?? 1), version)
  if (refused !== null)
    return (
      <p data-refused={refused} className="p-6 font-mono text-sm">
        {refused}
      </p>
    )
  if (week === LEGEND_WEEK)
    return (
      <WeekStory
        key={LEGEND_WEEK}
        season={season}
        week={null}
        initialSlide={initialSlide}
        record={record}
        scene={scene}
        version={version}
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
      scene={scene}
      version={version}
      onWeekChange={onWeekChange}
    />
  )
}
