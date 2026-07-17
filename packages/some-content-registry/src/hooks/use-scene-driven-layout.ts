import { useMemo } from "react"
import type { YouTubeRegion } from "some-types-utils"
import { usePrimaryScene } from "some-ui-utils"
import type { LayoutNode } from "wireframes"

import { SCENE_LAYOUT_MAP } from "../types/layout-trees-map"

type ReturnType = {
  currentLayout: LayoutNode<YouTubeRegion> | null
}

function isSceneLayoutKey(
  value: string
): value is keyof typeof SCENE_LAYOUT_MAP {
  return value in SCENE_LAYOUT_MAP
}

export function useSceneDrivenLayout(): ReturnType {
  const primaryScene = usePrimaryScene()

  const currentLayout = useMemo<LayoutNode<YouTubeRegion> | null>(() => {
    // No active scene → clear layout
    if (!primaryScene || !("Scene" in primaryScene.kind)) {
      return null
    }

    const sceneName = primaryScene.kind.Scene.scene_name

    return isSceneLayoutKey(sceneName) ? SCENE_LAYOUT_MAP[sceneName] : null
  }, [primaryScene])

  return {
    currentLayout,
  }
}
