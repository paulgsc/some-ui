import { Fragment, useMemo } from "react"
import { buildViewportConfigForRegion } from "@content/utils/orchestrator-to-viewport"
import { componentRegistry } from "@some-ui/content"
import type {
  ViewportConfig,
  WasmCycleName,
  YouTubeRegion,
} from "some-types-utils"
import { PolyhedronFactory } from "some-types-utils"
import { ViewportDiceCard } from "some-ui-slideshow"
import { useOrchestratorStore } from "some-ui-utils"

type CubeContentProps = {
  region: YouTubeRegion
  faceCapacity?: number
  rotationAxis?: WasmCycleName
}

const simpleCubeConfig: ViewportConfig = {
  id: "simple-cube",
  items: [
    {
      kind: "neon",
      contentIndex: 0,
      durationMs: 3000,
      props: {},
    },
    {
      kind: "neon",
      contentIndex: 1,
      durationMs: 3000,
      props: {},
    },
    {
      kind: "neon",
      contentIndex: 2,
      durationMs: 3000,
      props: {},
    },
    {
      kind: "neon",
      contentIndex: 3,
      durationMs: 3000,
      props: {},
    },
  ],
  polyhedron: PolyhedronFactory.cube(),
  faceCapacity: 1,
  cycleName: "cube:y",
}

const CubeContent = ({
  region,
  faceCapacity = 1,
  rotationAxis = "cube:y",
}: CubeContentProps): React.JSX.Element => {
  const orchestratorState = useOrchestratorStore((s) => s.state)

  const viewportConfig = useMemo<ViewportConfig>(() => {
    return {
      ...buildViewportConfigForRegion(
        orchestratorState,
        region,
        faceCapacity,
        rotationAxis
      ),
    }
  }, [orchestratorState, region, faceCapacity])

  ///if (orchestratorState.active_lifetimes.length <= 0) return <Fragment />

  return (
    <ViewportDiceCard
      viewportConfig={simpleCubeConfig}
      registry={componentRegistry}
      hideBackface={true}
    />
  )
}

export default CubeContent
