import type { ReactNode } from "react"
import { X_AXIS_FACE_SEQUENCE } from "@milestones/lib/dice-face-order"
import type { Milestone } from "@milestones/types"
import { DiceCard } from "@some-ui/dice-card"
import { cn } from "some-ui-utils"

import { MilestoneFace } from "./milestone-face"
import { MilestoneStatFace } from "./milestone-stat-face"

type Props = {
  milestone: Milestone
  cubeId: number
  durationMs: number
  active?: boolean
  className?: string
}

/**
 * One grid cell, one milestone, its own independent cube (own `cubeId`,
 * `mode="autoplay"`) tumbling on the X-axis — the grid's rotation runs on
 * the opposite axis from the hero dice so the wall doesn't read as a copy
 * of it. Front and back faces of the milestone alternate around the 4
 * physical positions, so every quarter-turn is a meaningful flip rather
 * than the same content spinning in place.
 */
export const MilestoneGridCell = ({
  milestone,
  cubeId,
  durationMs,
  active = false,
  className,
}: Props): React.JSX.Element => {
  const faces: Array<ReactNode> = []
  X_AXIS_FACE_SEQUENCE.forEach((facePosition, k) => {
    faces[facePosition] =
      k % 2 === 0 ? (
        <MilestoneFace key="front" milestone={milestone} compact />
      ) : (
        <MilestoneStatFace key="back" milestone={milestone} />
      )
  })

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg transition-shadow",
        active && "ring-2 ring-primary/60",
        className
      )}
    >
      <DiceCard
        cubeId={cubeId}
        className="size-full"
        faceClassName="p-0"
        faces={faces}
        dof="X-axis"
        mode="autoplay"
        duration={durationMs}
        showBeam={false}
        hideBackface
        // See MilestoneDice: a large perspective keeps a face's forward
        // translateZ a small enough fraction of it that the perspective
        // magnification stays inside the cell instead of bleeding past it —
        // `overflow-hidden` on the wrapper above isn't reliable here either.
        perspective={2600}
      />
    </div>
  )
}
