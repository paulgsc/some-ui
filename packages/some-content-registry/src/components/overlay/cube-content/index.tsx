import { useMemo } from "react"
import { componentRegistry } from "@some-ui/content-registry"
import { ViewportDiceCard } from "@some-ui/slideshow"
import type {
  ViewportConfig,
  WasmCycleName,
  YouTubeRegion,
} from "@some-ui/types"
import { cn, useSceneLifetimes } from "some-ui-utils"

import { buildViewportConfigForRegion } from "../../../utils/orchestrator-to-viewport"

type CubeContentProps = {
  region: YouTubeRegion
  faceCapacity?: number
  rotationAxis?: WasmCycleName
  className?: string
}

const CubeContent = ({
  region,
  faceCapacity = 1,
  rotationAxis = "cube:y",
  className,
}: CubeContentProps): React.JSX.Element | null => {
  // Use shallow comparison to prevent unnecessary re-renders
  const activeLifetimes = useSceneLifetimes()

  const viewportConfig = useMemo<ViewportConfig>(() => {
    return buildViewportConfigForRegion(
      activeLifetimes,
      region,
      faceCapacity,
      rotationAxis
    )
  }, [activeLifetimes, region, faceCapacity, rotationAxis])

  if (activeLifetimes.length <= 0) return null

  return (
    <div className={cn(className, "relative")}>
      <ViewportDiceCard
        viewportConfig={viewportConfig}
        registry={componentRegistry}
      />
    </div>
  )
}

export default CubeContent
