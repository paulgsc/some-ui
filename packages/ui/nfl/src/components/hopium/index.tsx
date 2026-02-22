import type { FC, JSX } from "react"
import { BentoWireframe } from "@nfl/components/hopium/bento-grid"
import { EventCard } from "@nfl/components/hopium/event-card"
import { Header } from "@nfl/components/hopium/header"
import { RollercoasterChart } from "@nfl/components/hopium/rollercoaster"
import { StreakCard } from "@nfl/components/hopium/streak-card"
import { SummarySidebar } from "@nfl/components/hopium/summary-sidebar"
import { useReplayTimeline } from "@nfl/hooks/hopium/use-replay-timeline"
import type { MoodEvent } from "@nfl/types/hopium/hopium-tracker"

type HopiumProps = {
  seasonEvents: Array<MoodEvent>
}

export const Hopium: FC<HopiumProps> = ({ seasonEvents }): JSX.Element => {
  const { index, current, currentWeek, animationDuration, summaries } =
    useReplayTimeline(seasonEvents, {
      animateMs: 600,
      pauseMs: 900,
      loop: true,
      speedMultiplier: 1,
    })

  return (
    <BentoWireframe
      className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white"
      // 3 — Header
      top={<Header currentWeek={currentWeek} />}
      // 2 — EventCard (+ controls aligned right)
      bar={<EventCard event={current} keySeed={index} />}
      // 1 — Main chart
      main={
        <div className="size-full">
          <RollercoasterChart
            events={seasonEvents}
            currentIndex={index}
            animationDuration={animationDuration}
          />
        </div>
      }
      // 4 — StreakCard
      asideTop={<StreakCard events={seasonEvents} index={index} />}
      // 6 — SummarySidebar (second section)
      asideBottom={
        <div className="h-full overflow-auto">
          <SummarySidebar
            summaries={summaries}
            currentWeek={currentWeek}
            currentMood={current?.mood ?? 100}
          />
        </div>
      }
    />
  )
}
