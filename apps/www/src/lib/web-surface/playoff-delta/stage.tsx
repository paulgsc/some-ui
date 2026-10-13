import type { ComponentProps, JSX } from "react"
import { createDataSource } from "@some-ui/fetch-kit"
// This module is itself the lazy chunk: the door (`..`) reaches it only
// through `import()`, so this static edge costs no host anything eagerly.
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
  // GitHub's raw files are `text/plain`; the body is JSON all the same.
  { mode: DATA_MODE, fetchOptions: { ...PUBLIC_READ, responseAs: "json" } }
)

/**
 * The stage as this app binds it: given no season, it plays this season's
 * real one (`./feed`), validated against the contract.
 *
 * - **Pages** (`DATA_MODE === "static"`): no request. Its `connect-src 'self'`
 *   policy (LA5) would block one anyway; the stage plays the bundled
 *   invented season, which says so on screen.
 * - **Elsewhere**: nothing renders until the file answers, so a recording
 *   never opens on the wrong numbers. If it fails (no season published yet,
 *   offline), the stage falls back to the invented season, labelled as such.
 */
export const PlayoffDeltaLiveStage = ({
  season,
  ...rest
}: ComponentProps<typeof PlayoffDeltaStage>): JSX.Element | null => {
  const feed: SeasonFeed = {
    season: seasonOf(new Date()),
    team: STORY_TEAM,
  }
  const { data, isPending } = seasonSource.useResource(
    ["playoff-delta", feed.season, feed.team],
    feed,
    StorySeasonSchema,
    { enabled: FETCHES_CONTENT && season === undefined, retry: 1 }
  )
  if (season !== undefined)
    return <PlayoffDeltaStage season={season} {...rest} />
  if (FETCHES_CONTENT && isPending) return null
  return <PlayoffDeltaStage season={data} {...rest} />
}
