import type { FC, ReactNode } from "react"
import { Fragment, useEffect } from "react"
import { CubeGeometry } from "@slideshow/components/cube-geometry"
import type { ViewportConfig } from "some-types-utils"
import { BorderBeam } from "some-ui-shared"
import { useCycleRotationAdapter, useViewport } from "some-ui-utils"

export type ViewportDiceCardProps = {
  viewportConfig: ViewportConfig
  renderContent: (index: number, isActive: boolean) => ReactNode
  perspective?: number
  className?: string
  faceClassName?: string
  showBeam?: boolean
  hideBackface?: boolean
}

export const ViewportDiceCard: FC<ViewportDiceCardProps> = ({
  viewportConfig,
  renderContent,
  perspective,
  className,
  faceClassName,
  showBeam = true,
  hideBackface = false,
}) => {
  const { faces, state, isLoading, error } = useViewport(viewportConfig, {
    autoTick: true,
    tickIntervalMs: 100,
    autoRefresh: true,
  })

  const { xRotation, yRotation } = useCycleRotationAdapter({
    cyclePosition: state?.cyclePosition ?? 0,
    cycleLength: state?.cycleLength ?? faces.length,
    axis: "Y-axis",
  })

  useEffect(() => {
    console.log(`xrotation: ${xRotation}, yrotation: ${yRotation}`)
    console.log("state: ", state)
  }, [xRotation, yRotation, state])

  if (isLoading) return <div>Loading…</div>
  if (error) return <div>Error: {error}</div>

  return (
    <CubeGeometry
      perspective={perspective}
      xRotation={xRotation}
      yRotation={yRotation}
      className={className}
      faceClassName={faceClassName}
      hideBackface={hideBackface}
      faces={faces.map((face, faceIndex) => ({
        key: faceIndex,
        content: (
          <div className="size-full p-4">
            {showBeam && face.isActive && (
              <BorderBeam size={16} duration={0.5} />
            )}
            {face.contentIndices.map((idx) => (
              <Fragment key={idx}>
                {renderContent(idx, state?.cursor === idx)}
              </Fragment>
            ))}
          </div>
        ),
      }))}
    />
  )
}
