import { sampleMilestones } from "@milestones/data"
import { useMilestoneCycle } from "@milestones/hooks/use-milestone-cycle"
import type { Milestone } from "@milestones/types"
import { Pause, Play } from "lucide-react"
import { cn } from "some-ui-utils"

import { MilestoneDice } from "./milestone-dice"
import { MilestoneFace } from "./milestone-face"
import { MilestoneTimeline } from "./milestone-timeline"

type Props = {
  milestones?: ReadonlyArray<Milestone>
  cubeId?: number
  cycleMs?: number
  className?: string
}

/**
 * The desktop branch is the actual deliverable: `lg:h-dvh lg:overflow-hidden`
 * on the root plus `minmax(0,1fr)` on the dice row means the layout can only
 * ever shrink to fit the viewport, never grow past it — there is no scroll
 * path to test for, because none exists. The dice card is desktop-only; a
 * rotating 3D cube synced to a timer is a poor fit for a touch surface a
 * user might want to actually read at their own pace, so mobile gets a
 * plain, fully scrollable stack of the same milestones instead of a shrunk
 * copy of the desktop layout.
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

  return (
    <section
      className={cn(
        "flex flex-col bg-background text-foreground lg:h-dvh lg:overflow-hidden",
        className
      )}
    >
      {/* Desktop / tablet-landscape: fixed viewport, dice + synced timeline. */}
      <div className="hidden h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_11rem] lg:grid">
        <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Milestones</h1>
            <p className="text-sm text-muted-foreground">
              {milestones.length} logged · one rotating archive
            </p>
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

        <div className="flex min-h-0 items-center justify-center overflow-hidden px-6 py-4">
          <MilestoneDice
            milestones={milestones}
            cubeId={cubeId}
            className="h-[clamp(240px,42vh,460px)] max-h-full w-full max-w-3xl"
          />
        </div>

        <div className="min-h-0 overflow-hidden border-t border-border p-4">
          <MilestoneTimeline
            milestones={milestones}
            activeIndex={activeIndex}
            onSelect={select}
            className="h-full"
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
