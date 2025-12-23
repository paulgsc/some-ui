import type {
  OrchestratorState,
  ViewportConfig,
  WasmCycleName,
  WasmItem,
  YouTubeRegion,
} from "some-types-utils"
import { PolyhedronFactory } from "some-types-utils"

/**
 * Build viewport config for a single region
 *
 * This function is intentionally region-scoped so callers can
 * build independent viewports per region.
 */
export function buildViewportConfigForRegion(
  state: OrchestratorState,
  region: YouTubeRegion,
  faceCapacity: number,
  rotationAxis: WasmCycleName
): ViewportConfig {
  const items: Array<WasmItem> = []

  for (const lifetime of state.active_lifetimes) {
    if (lifetime.kind.type !== "Scene") continue

    const ui = lifetime.kind.ui
    const panel = ui?.panels?.[region]
    if (!panel?.children) continue

    const elapsed = state.current_time - lifetime.started_at

    panel.children.forEach((child, index) => {
      let durationMs = child.duration

      if (elapsed > 0 && elapsed < child.duration) {
        durationMs = child.duration - elapsed
      }

      items.push({
        kind: child.registryKey,
        props: child.props ?? {},
        durationMs,
        contentIndex: index,
      })
    })
  }

  return {
    items,
    id: region,
    faceCapacity,
    polyhedron: PolyhedronFactory.cube(),
    cycleName: rotationAxis,
  }
}
