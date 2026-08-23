import { sampleMilestones } from "@milestones/data"
import { useMilestoneCycle } from "@milestones/hooks/use-milestone-cycle"
import type { Milestone } from "@milestones/types"
import { Pause, Play } from "lucide-react"
import { cn } from "some-ui-utils"

import { MilestoneDice } from "./milestone-dice"
import { MilestoneFace } from "./milestone-face"
import { MilestoneGrid } from "./milestone-grid"
import { MilestoneHero } from "./milestone-hero"
import { MilestoneTimeline } from "./milestone-timeline"

type Props = {
  milestones?: ReadonlyArray<Milestone>
  cubeId?: number
  cycleMs?: number
  className?: string
}

/**
 * The desktop branch is the actual deliverable: `lg:h-dvh lg:overflow-hidden`
 * on the root plus `minmax(0,1fr)` on every flexible row/column means the
 * layout can only ever shrink to fit the viewport, never grow past it —
 * there is no scroll path to test for, because none exists. A rotating 3D
 * grid synced to a timer is a poor fit for a touch surface a user might
 * want to actually read at their own pace, so mobile drops the dice
 * entirely for a plain, fully scrollable stack of the same milestones.
 *
 * Grid cell cubes use `cubeId + 100 + index` — offset well clear of the
 * hero dice's own id so a custom `cubeId` prop can never collide with them.
 */
export const MilestoneBoard = ({
  milestones = sampleMilestones,
  cubeId = 1,
  cycleMs = 5200,
  className,
}: Props): React.JSX.Element => {
  const { activeIndex, isPlaying, select, togglePlaying } = useMilestoneCycle({
    count: milestones.length,
    cubeId,
    intervalMs: cycleMs,
  })
  const active = milestones[activeIndex] ?? milestones[0]

  return (
    <section
      className={cn(
        "flex flex-col bg-background text-foreground lg:h-dvh lg:overflow-hidden",
        className
      )}
    >
      {/* Desktop / tablet-landscape: fixed viewport, hero dice + timeline
          on the left, a wall of independently-rotating dice on the right. */}
      <div className="hidden h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] lg:grid">
        <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-primary" aria-hidden />
            <strong className="font-mono text-xs uppercase tracking-widest">
              Milestones
            </strong>
          </div>
          <button
            type="button"
            onClick={togglePlaying}
            aria-pressed={isPlaying}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {isPlaying ? (
              <Pause className="size-3.5" aria-hidden />
            ) : (
              <Play className="size-3.5" aria-hidden />
            )}
            {isPlaying ? "Pause" : "Resume"}
          </button>
        </header>

        {active && (
          <MilestoneHero
            milestone={active}
            index={activeIndex}
            count={milestones.length}
            className="border-b border-border px-6 py-5"
          />
        )}

        <div className="grid min-h-0 grid-cols-[0.85fr_1.15fr] gap-5 p-5">
          <div className="flex min-h-0 flex-col gap-4">
            <div className="flex min-h-0 flex-[1.3] items-center justify-center overflow-hidden">
              {/* `DiceCard`'s Y-axis faces are pushed out in 3D by half the
                  container's *width*, independent of height — an
                  unconstrained width here would translate a face far enough
                  toward the camera to blow past `perspective` and visibly
                  overflow the box. Capping width (not height) is what keeps
                  the cube's geometry sane. */}
              <MilestoneDice
                milestones={milestones}
                activeIndex={activeIndex}
                cubeId={cubeId}
                compact
                className="h-full w-full max-w-sm"
              />
            </div>
            <div className="min-h-0 flex-1 rounded-lg border border-border p-3">
              <MilestoneTimeline
                milestones={milestones}
                activeIndex={activeIndex}
                onSelect={select}
                className="h-full"
              />
            </div>
          </div>

          <MilestoneGrid
            milestones={milestones}
            activeIndex={activeIndex}
            baseCubeId={cubeId + 100}
          />
        </div>
      </div>

      {/* Mobile / narrow tablet: no fixed viewport, no dice — a plain,
          freely-scrolling stack of the same milestones. */}
      <div className="flex flex-col gap-4 p-4 lg:hidden">
        <header>
          <h1 className="text-lg font-semibold tracking-tight">Milestones</h1>
          <p className="text-sm text-muted-foreground">
            {milestones.length} logged
          </p>
        </header>
        {milestones.map((milestone) => (
          <div key={milestone.id} className="min-h-[220px]">
            <MilestoneFace milestone={milestone} />
          </div>
        ))}
      </div>
    </section>
  )
}
