import type { YouTubeRegion } from "some-types-utils"
import type { LayoutNode } from "wireframes"

/**
 * Fallback topology for a scene with no persisted `layout` (e.g. a session
 * saved before layout ownership moved onto `SceneConfig` - see epic #693
 * story 3). Every scene the activity catalog creates now carries its own
 * `layout` (`toSceneConfig`); this is a safety net for legacy data, not the
 * source of truth.
 */
export const FALLBACK_LAYOUT: LayoutNode<YouTubeRegion> = {
  type: "leaf",
  id: "mainContent",
}
