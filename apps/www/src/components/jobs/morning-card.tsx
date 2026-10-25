/**
 * What this morning's run did, at the top of Today (RUN1, `lib/jobs/morning`):
 * J0's card wearing the run's state, its words under the bar, and whatever
 * the screen offers beside them.
 */
import type { JSX, ReactNode } from "react"

import type { Morning } from "@/lib/jobs/morning"
import {
  MORNING_IDS,
  MORNING_LEGEND,
  morningLabel,
  morningRoad,
  morningSaid,
  morningStop,
  morningTheme,
} from "@/lib/jobs/morning"
import { StatusCard } from "@/components/journey-status"

export const MorningCard = ({
  morning,
  now,
  children,
}: {
  morning: Morning
  now: Date
  children?: ReactNode
}): JSX.Element => {
  const said = morningSaid(morning, now)
  return (
    <StatusCard
      title={said.title}
      state={{
        id: morning.id,
        theme: morningTheme(morning.id),
        at: morningStop(morning.id),
        said,
        label: morningLabel(said),
        road: morningRoad(morning.id),
        every: MORNING_IDS.map((id) => ({
          id,
          title: MORNING_LEGEND[id],
          theme: morningTheme(id),
        })),
      }}
    >
      <div className="flex flex-col gap-3 px-3.5 py-3">
        <p className="text-muted-foreground text-sm">{said.line}</p>
        {children}
      </div>
    </StatusCard>
  )
}
