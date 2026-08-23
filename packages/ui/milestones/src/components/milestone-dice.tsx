import type { ReactNode } from "react"
import { Y_AXIS_FACE_SEQUENCE } from "@milestones/lib/dice-face-order"
import type { Milestone } from "@milestones/types"
import { DiceCard } from "@some-ui/dice-card"
import { cn } from "some-ui-utils"

import { MilestoneFace } from "./milestone-face"

type Props = {
  milestones: ReadonlyArray<Milestone>
  cubeId: number
  className?: string
}

export const MilestoneDice = ({
  milestones,
  cubeId,
  className,
}: Props): React.JSX.Element => {
  const faces: Array<ReactNode> = []
  Y_AXIS_FACE_SEQUENCE.forEach((facePosition, sequenceIndex) => {
    const milestone = milestones[sequenceIndex]
    if (milestone) {
      faces[facePosition] = (
        <MilestoneFace key={milestone.id} milestone={milestone} />
      )
    }
  })

  return (
    <DiceCard
      cubeId={cubeId}
      className={cn("size-full", className)}
      faceClassName="p-0 shadow-lg"
      faces={faces}
      dof="Y-axis"
      mode="manual"
      showBeam={false}
      hideBackface
    />
  )
}
