import type { ReactNode } from "react"
import { Y_AXIS_FACE_SEQUENCE } from "@milestones/lib/dice-face-order"
import type { Milestone } from "@milestones/types"
import { DiceCard } from "@some-ui/dice-card"
import { cn } from "some-ui-utils"

import { MilestoneFace } from "./milestone-face"

type Props = {
  milestones: ReadonlyArray<Milestone>
  activeIndex: number
  cubeId: number
  /** Denser faces — the hero board sits this next to the full-detail hero,
   * which already carries the active milestone's title/quote/stats. */
  compact?: boolean
  className?: string
}

/**
 * The cube only has 4 usable faces per rotation axis, but there can be more
 * than 4 milestones — the timeline this dice pairs with runs to 6. Faces are
 * therefore assigned relative to the current lap of 4 around `activeIndex`
 * rather than milestones' absolute position, so the face the cube is about
 * to land on always holds `milestones[activeIndex]` by the time it's
 * visible, and a multi-step jump (e.g. clicking 3 timeline rows ahead) shows
 * correct content on the faces it passes through along the way too.
 */
export const MilestoneDice = ({
  milestones,
  activeIndex,
  cubeId,
  compact = false,
  className,
}: Props): React.JSX.Element => {
  const lapSize = Y_AXIS_FACE_SEQUENCE.length
  const lapStart = activeIndex - (activeIndex % lapSize)

  const faces: Array<ReactNode> = []
  Y_AXIS_FACE_SEQUENCE.forEach((facePosition, k) => {
    const milestone = milestones[(lapStart + k) % milestones.length]
    if (milestone) {
      faces[facePosition] = (
        <MilestoneFace
          key={milestone.id}
          milestone={milestone}
          compact={compact}
        />
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
      // `overflow: hidden` on an ancestor does not reliably clip content
      // inside a `perspective`/`preserve-3d` context across browsers, so a
      // face translated forward by a non-trivial fraction of `perspective`
      // visibly bleeds past its box instead of being cropped. A much larger
      // perspective keeps that ratio small enough (translateZ here is at
      // most ~200px) that the resulting magnification is negligible rather
      // than something a clip rect has to catch.
      perspective={2600}
    />
  )
}
