import type { ReactNode } from "react"
import { useState } from "react"
import { MilestoneFace } from "@milestones/components/milestone-face"
import { Y_AXIS_FACE_SEQUENCE } from "@milestones/lib/dice-face-order"
import type { Milestone } from "@milestones/types"
import { DiceCard } from "@some-ui/dice-card"
import { cn } from "some-ui-utils"

type Props = {
  milestones: ReadonlyArray<Milestone>
  activeIndex: number
  cubeId: number
  /** Denser faces — the hero board sits this next to the full-detail hero,
   * which already carries the active milestone's title/quote/stats. */
  compact?: boolean
  className?: string
}

const initialFaceMap = (count: number): Record<number, number> => {
  const map: Record<number, number> = {}
  Y_AXIS_FACE_SEQUENCE.forEach((facePosition, k) => {
    map[facePosition] = k % count
  })
  return map
}

/**
 * The cube only has 4 usable faces per rotation axis, but there can be more
 * than 4 milestones — the timeline this dice pairs with runs to 6. Faces are
 * assigned as a small piece of state, keyed by physical position, rather
 * than recomputed fresh from `activeIndex` on every render: only the face
 * becoming the new rotation target is updated, so the face currently on
 * screen never has its content swapped out from under it before the cube
 * has actually rotated away — recomputing every face from `activeIndex`
 * (as this used to) replaced the *outgoing* face's content the instant a
 * lap boundary was crossed (e.g. index 3 -> 4), before rotation even
 * started, flashing an unrelated milestone onto the face still in view.
 *
 * The face map is adjusted during render — comparing `activeIndex` against
 * the last-seen value held in state — rather than in an effect, so the
 * update lands in the same commit as the prop change instead of a
 * follow-up render (react-hooks/set-state-in-effect forbids the effect
 * form; this is the pattern React's own docs recommend in its place).
 */
export const MilestoneDice = ({
  milestones,
  activeIndex,
  cubeId,
  compact = false,
  className,
}: Props): React.JSX.Element => {
  const [faceMilestoneIndex, setFaceMilestoneIndex] = useState<
    Record<number, number>
  >(() => initialFaceMap(milestones.length))
  const [seenActiveIndex, setSeenActiveIndex] = useState(activeIndex)

  if (activeIndex !== seenActiveIndex) {
    setSeenActiveIndex(activeIndex)
    const targetFace =
      Y_AXIS_FACE_SEQUENCE[activeIndex % Y_AXIS_FACE_SEQUENCE.length]
    if (targetFace !== undefined) {
      setFaceMilestoneIndex((prev) => ({ ...prev, [targetFace]: activeIndex }))
    }
  }

  const faces: Array<ReactNode> = []
  Y_AXIS_FACE_SEQUENCE.forEach((facePosition) => {
    const milestoneIndex = faceMilestoneIndex[facePosition]
    const milestone =
      milestoneIndex !== undefined ? milestones[milestoneIndex] : undefined
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
