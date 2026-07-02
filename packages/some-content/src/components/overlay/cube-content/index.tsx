import { Fragment, useMemo } from "react"
import { buildViewportConfigForRegion } from "@content/utils/orchestrator-to-viewport"
import { componentRegistry } from "@some-ui/content"
import { ViewportDiceCard } from "@some-ui/slideshow"
import type {
  ViewportConfig,
  WasmCycleName,
  YouTubeRegion,
} from "some-types-utils"
import { cn, useSceneLifetimes } from "some-ui-utils"

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
}: CubeContentProps): React.JSX.Element => {
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

  if (activeLifetimes.length <= 0) return <Fragment />

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
