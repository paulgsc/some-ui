import type {
  ActiveLifetime,
  ViewportConfig,
  WasmCycleName,
  WasmItem,
  YouTubeRegion,
} from "some-types-utils"
import { PolyhedronFactory } from "some-types-utils"

/**
 * Build viewport config for a single region
 *
 * Region-scoped: each region gets its own viewport.
 */
export function buildViewportConfigForRegion(
  activeLifetimes: Array<ActiveLifetime>,
  region: YouTubeRegion,
  faceCapacity: number,
  rotationAxis: WasmCycleName
): ViewportConfig {
  const items: Array<WasmItem> = []

  for (const lifetime of activeLifetimes) {
    const scene = lifetime.kind.Scene
    if (!scene.ui) continue

    for (const layout of scene.ui) {
      const panel = layout.panels?.[region]
      if (!panel?.children) continue

      panel.children.forEach((child, index) => {
        let durationMs = child.duration

        items.push({
          kind: child.registry_key,
          props: child.props ?? {},
          durationMs,
          contentIndex: index,
        })
      })
    }
  }

  return {
    id: region,
    items,
    faceCapacity,
    polyhedron: PolyhedronFactory.cube(),
    cycleName: rotationAxis,
  }
}
