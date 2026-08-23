import { MilestoneGridCell } from "@milestones/components/milestone-grid-cell"
import type { Milestone } from "@milestones/types"
import { cn } from "some-ui-utils"

type Props = {
  milestones: ReadonlyArray<Milestone>
  activeIndex: number
  baseCubeId: number
  baseDurationMs?: number
  className?: string
}

/**
 * One dice card per milestone, one 1:1 with each row of the timeline. Each
 * cell gets its own `cubeId` (`baseCubeId + index`) and a duration staggered
 * by index so six identical cubes don't all flip in lockstep — a wall of
 * independently drifting cards reads as alive, six perfectly synced ones
 * read as a single broken animation.
 */
export const MilestoneGrid = ({
  milestones,
  activeIndex,
  baseCubeId,
  baseDurationMs = 4200,
  className,
}: Props): React.JSX.Element => (
  <div
    className={cn(
      "grid h-full min-h-0 grid-cols-2 grid-rows-3 gap-3 rounded-2xl border border-border/60 bg-card/40 p-3 shadow-sm",
      className
    )}
  >
    {milestones.map((milestone, index) => (
      <MilestoneGridCell
        key={milestone.id}
        milestone={milestone}
        cubeId={baseCubeId + index}
        durationMs={baseDurationMs + index * 350}
        active={index === activeIndex}
      />
    ))}
  </div>
)
