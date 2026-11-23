/**
 * An episode's rendered assets (ASSETS-R, C1300): what a render leaves on
 * home beside the episode, as one union known at compile time. The phone
 * shows each, home serves each, and an asset a render left out can be asked
 * for again (`POST /feeds/:feed/videos/:key/produce`, shared with an essay's
 * run again).
 *
 * A member is made in one of two ways (`ASSET_MADE`):
 *
 * - `render`: only by rendering the episode again, because it comes out of
 *   the render itself: the video, and its description, whose chapters are
 *   at the scenes' real times;
 * - `alone`: on its own, from what the render kept in the episode's folder,
 *   with the video untouched: the thumbnail, from its genre's facts and the
 *   cut list (`record:asset --asset thumbnail`).
 *
 * Each member's file is `ASSET_FILE`'s, but the video's, which each feed's
 * recorder names (`call.mp4`, `essay.mp4`, …) and home already serves
 * (`GET …/video`). A new kind of file a render leaves is a new member here,
 * and every table keyed by `EpisodeAsset` fails to compile until it says
 * what to do with it.
 */

/** What a render leaves beside an episode, in the order the phone shows them. */
export const EPISODE_ASSETS = ["video", "thumbnail", "description"] as const

export type EpisodeAsset = (typeof EPISODE_ASSETS)[number]

/** How each asset is made: by the episode's render, or on its own. */
export const ASSET_MADE = {
  video: "render",
  thumbnail: "alone",
  description: "render",
} as const satisfies Readonly<Record<EpisodeAsset, "render" | "alone">>

/** The assets home can make on their own, without rendering again. */
export type AloneAsset = {
  readonly [A in EpisodeAsset]: (typeof ASSET_MADE)[A] extends "alone"
    ? A
    : never
}[EpisodeAsset]

/**
 * What home can be asked to make (`POST …/produce`): an asset made on its
 * own, or the video, which home makes by rendering the episode again (an
 * episode that couldn't finish, run again from Studio › Renders, RETRY). The
 * description is never asked for alone: it comes with its video.
 */
export type ProducedAsset = AloneAsset | "video"

/** The assets made on their own, as a list a command can check a flag by. */
export const ALONE_ASSETS: ReadonlyArray<AloneAsset> = EPISODE_ASSETS.filter(
  (asset): asset is AloneAsset => ASSET_MADE[asset] === "alone"
)

/** Whether `value` names an asset made on its own. */
export const isAloneAsset = (value: string): value is AloneAsset =>
  ALONE_ASSETS.some((asset) => asset === value)

/** Each asset's file in the episode's folder; the video's is its feed's. */
export const ASSET_FILE = {
  thumbnail: "thumbnail.png",
  description: "description.txt",
} as const satisfies Readonly<Record<Exclude<EpisodeAsset, "video">, string>>
