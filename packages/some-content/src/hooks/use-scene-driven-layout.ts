import { useEffect, useState } from "react"
import { SCENE_LAYOUT_MAP } from "@content/types/layout-trees-map"
import type { YouTubeRegion } from "some-types-utils"
import { usePrimaryScene } from "some-ui-utils"
import type { LayoutNode } from "wireframes"

type ReturnType = {
  currentLayout: LayoutNode<YouTubeRegion> | null
}

export function useSceneDrivenLayout(): ReturnType {
  const primaryScene = usePrimaryScene()
  const [currentLayout, setCurrentLayout] =
    useState<LayoutNode<YouTubeRegion> | null>(null)

  useEffect(() => {
    // No active scene → clear layout
    if (!primaryScene || !("Scene" in primaryScene.kind)) {
      return
    }

    const sceneName = primaryScene.kind.Scene.scene_name

    const layout = SCENE_LAYOUT_MAP[sceneName as keyof typeof SCENE_LAYOUT_MAP]

    setCurrentLayout(layout)
  }, [primaryScene])

  return {
    currentLayout,
  }
}
