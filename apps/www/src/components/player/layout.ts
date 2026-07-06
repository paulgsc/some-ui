import type { YouTubeRegion } from "some-types-utils"
import type { LayoutNode } from "wireframes"

/**
 * Every activity's scene renders into a single "mainContent" panel (see
 * `toSceneConfig`), so the player only ever needs one region. Using one of
 * the multi-region layout trees here (title/sidebar/etc.) would render
 * empty placeholder boxes for regions nothing ever populates.
 */
export const MAIN_CONTENT_LAYOUT: LayoutNode<YouTubeRegion> = {
  type: "leaf",
  id: "mainContent",
}
