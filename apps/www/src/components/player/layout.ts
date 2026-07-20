import type { SlotId } from "some-types-utils"
import type { LayoutNode } from "wireframes"

/**
 * The naive default: one leaf, filling `V`. Permanent for an indifferent
 * user, not a seed - a session only ever gets richer topology than this
 * by an explicit edit through the live editor (story 6). Every activity's
 * scene still renders into this single "mainContent" panel until a user
 * places more leaves (see `toSceneConfig`).
 */
export const NAIVE_LAYOUT: LayoutNode<SlotId> = {
  type: "leaf",
  id: "mainContent",
}
