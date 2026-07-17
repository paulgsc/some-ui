import type { LayoutNode } from "@wireframes/lib"
import {
  dramaTree,
  studyTree,
  topikTree,
  voiceTree,
} from "@wireframes/lib/layout-tree"
import type { YouTubeRegion } from "some-types-utils"

export type SceneName =
  | "cdrama"
  | "assessment"
  | "interview"
  | "topik"
  | "voice"
  | "constant"
  | "hangulTyping"
  | "leetype"

// Compile-time known map
export const SCENE_LAYOUT_MAP: Record<SceneName, LayoutNode<YouTubeRegion>> = {
  cdrama: dramaTree,
  assessment: studyTree,
  interview: topikTree,
  topik: topikTree,
  voice: voiceTree,
  constant: studyTree,
  hangulTyping: studyTree,
  leetype: studyTree,
}
