import { useEffect, useState } from "react"
import { SCENE_LAYOUT_MAP } from "@content/types/layout-trees-map"
import { usePrimaryScene } from "some-ui-utils"
import type { LayoutNode } from "wireframes"

type ReturnType = {
  currentLayout: LayoutNode<YouTubeRegion>
}

export function useSceneDrivenLayout(): ReturnType {
  const primaryScene = usePrimaryScene()
  const [currentLayout, setCurrentLayout] =
    useState<LayoutNode<YouTubeRegion>>(null)

  useEffect(() => {
    // No active scene → clear layout
    if (!primaryScene || !("Scene" in primaryScene.kind)) {
      return
    }

    const sceneName = primaryScene.kind.Scene.scene_name

    const layout = SCENE_LAYOUT_MAP[sceneName as keyof typeof SCENE_LAYOUT_MAP]

    if (!layout || layout.length <= 0) {
      console.warn(`[layout] No layout registered for scene: ${sceneName}`)
      setCurrentLayout([])
      return
    }

    setCurrentLayout(layout)
  }, [primaryScene])

  return {
    currentLayout,
  }
}
