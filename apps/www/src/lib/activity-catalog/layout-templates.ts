import type { YouTubeRegion } from "some-types-utils"
import { dramaTree, studyTree, topikTree, voiceTree } from "wireframes"
import type { LayoutNode } from "wireframes"

import type { LayoutTreeId } from "./types"

/**
 * Seed topology per `LayoutTreeId` - consulted once, by `toSceneConfig`,
 * when a scene is first created. From that point on the scene owns its
 * `layout`; these templates are never read again at render time (see epic
 * #693 story 3 - this is what gives `layoutTreeFor` a real consumer instead
 * of a dormant lookup).
 */
export const LAYOUT_TEMPLATES: Record<
  LayoutTreeId,
  LayoutNode<YouTubeRegion>
> = {
  study: studyTree,
  topik: topikTree,
  drama: dramaTree,
  voice: voiceTree,
}
