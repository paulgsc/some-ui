import type { ComponentProps, JSX } from "react"
import { createDataSource } from "@some-ui/fetch-kit"
import {
  PlayoffDeltaStage,
  StorySeasonSchema,
  type StorySeason,
} from "@some-ui/playoff-delta"

import { DATA_MODE, FETCHES_CONTENT } from "@/lib/data-mode"
import { PUBLIC_READ } from "@/lib/file-host-config"

import { locateSeason, seasonOf, STORY_TEAM, type SeasonFeed } from "./feed"

const seasonSource = createDataSource<SeasonFeed, StorySeason>(
  { static: locateSeason, server: locateSeason },
  { mode: DATA_MODE, fetchOptions: { ...PUBLIC_READ, responseAs: "json" } }
)

export type LiveStageProps = Omit<
  ComponentProps<typeof PlayoffDeltaStage>,
  "season"
>

/**
 * The stage playing this season's real numbers (`./feed`), validated against
 * the contract.
 *
 * - **Pages:** no request; plays the bundled 2025 season.
 * - **Elsewhere:** renders nothing until the file answers, so a recording
 *   never opens on the wrong numbers; on failure, falls back to the bundled
 *   season, except in record mode, which stays blank.
 */
export const PlayoffDeltaLiveStage = (
  props: LiveStageProps
): JSX.Element | null => {
  const feed: SeasonFeed = { season: seasonOf(new Date()), team: STORY_TEAM }
  const { data, isPending } = seasonSource.useResource(
    ["playoff-delta", feed.season, feed.team],
    feed,
    StorySeasonSchema,
    { enabled: FETCHES_CONTENT, retry: 1 }
  )
  if (FETCHES_CONTENT && isPending) return null
  // A recording never falls back: with no frame, the recorder fails instead
  // of writing clips of the bundled season.
  if (FETCHES_CONTENT && props.record === true && data === undefined)
    return null
  return <PlayoffDeltaStage season={data} {...props} />
}
