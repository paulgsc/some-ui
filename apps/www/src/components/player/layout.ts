import type { YouTubeRegion } from "some-types-utils"
import type { LayoutNode } from "wireframes"

/**
 * The naive default: one leaf, filling V. Per epic #693's rewrite, this is
 * the permanent state for an indifferent user, not a seed - richer
 * topology is only ever introduced by a user explicitly invoking the live
 * editor (story 6, #700), which doesn't exist yet. Until then, every
 * session's layout is this.
 */
export const MAIN_CONTENT_LAYOUT: LayoutNode<YouTubeRegion> = {
  type: "leaf",
  id: "mainContent",
}
