import { useMemo } from "react"
import type { LayoutNode } from "@wireframes/lib"
import type { YouTubeRegion } from "some-types-utils"
import { usePrimaryScene } from "some-ui-utils"

type ReturnType = {
  currentLayout: LayoutNode<YouTubeRegion> | null
}

/**
 * The single place every renderer (player, overlay route) reads Layout(t)
 * from: the primary active scene's own persisted `layout`. There is no
 * scene-name dispatch table here - a scene either carries its own topology
 * or it doesn't (`null`), and the caller decides the fallback.
 */
export function useSceneDrivenLayout(): ReturnType {
  const primaryScene = usePrimaryScene()

  const currentLayout = useMemo<LayoutNode<YouTubeRegion> | null>(() => {
    if (!primaryScene || !("Scene" in primaryScene.kind)) {
      return null
    }

    return primaryScene.kind.Scene.layout ?? null
  }, [primaryScene])

  return {
    currentLayout,
  }
}
