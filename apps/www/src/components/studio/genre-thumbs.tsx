/**
 * A stock thumbnail per genre (EPISODES2, #3067; the owner, #3030: "for now,
 * let's just have some stock svg in lieu of thumbail images for each
 * 'category' of video"): `@some-ui/styles/brand/genres`' art, one hue and one
 * shape per feed, the same drawing an episode's own thumbnail carries
 * (`@some-ui/video-render`'s `thumbnail`, C1026). Fixed art, the same in
 * every theme, as a video's thumbnail is.
 */
import type { JSX } from "react"
import { drawNodes } from "@some-ui/shared"
import { GENRE_VIEW_BOX, genreArt } from "@some-ui/styles/brand/genres"
import type { Genre } from "@some-ui/styles/brand/genres"

import type { Feed } from "@/lib/feeds"
import { FEED_FACTS } from "@/lib/studio-index"

/** Every feed is a genre the brand draws, and every genre a feed. */
const genreOf = (feed: Feed): Genre => feed

/** `feed`'s stock thumbnail, 16:9, filling its box. */
export const GenreThumb = ({ feed }: { feed: Feed }): JSX.Element => (
  <svg
    viewBox={GENRE_VIEW_BOX}
    role="img"
    aria-label={FEED_FACTS[feed].name}
    className="block h-full w-full"
  >
    {drawNodes(genreArt(genreOf(feed)))}
  </svg>
)
