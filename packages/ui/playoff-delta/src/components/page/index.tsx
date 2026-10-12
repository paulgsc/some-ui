import type { JSX } from "react"
import { PlayoffDeltaStage } from "@playoff-delta/components/stage"
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import type { StorySeason } from "@playoff-delta/lib/story"

/**
 * The route's page: the stage over a season (the bundled sample until a real
 * feed is passed in). `slide` and `record` are the recorder's: `record`
 * renders the one slide, full-bleed, with nothing to press.
 */
export const PlayoffDeltaPage = ({
  season = SAMPLE_SEASON,
  week,
  slide,
  record,
  onWeekChange,
}: {
  season?: StorySeason
  week?: number
  slide?: number
  record?: boolean
  onWeekChange?: (week: number) => void
}): JSX.Element => {
  return (
    <PlayoffDeltaStage
      season={season}
      week={week}
      initialSlide={slide}
      record={record}
      onWeekChange={onWeekChange}
    />
  )
}
