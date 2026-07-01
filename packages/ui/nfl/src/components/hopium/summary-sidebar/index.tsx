import type { JSX } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "some-ui-shared"
import { cn } from "some-ui-utils"

type WeekSummary = {
  week: number
  change: number
  lastMood: number
}

type Props = {
  summaries: Array<WeekSummary>
  currentWeek: number
  currentMood: number
}

export const SummarySidebar = ({
  summaries,
  currentWeek,
  currentMood,
}: Props): JSX.Element => {
  return (
    <div className="w-80 shrink-0 space-y-4">
      <Card className="border-white/10 bg-slate-900/70">
        <CardHeader className="pb-2">
          <CardTitle className="bg-gradient-to-r from-sky-300 to-violet-300 bg-clip-text text-base text-transparent">
            Current Week
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline justify-between">
            <div className="bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-3xl font-extrabold text-transparent">
              {currentMood}
            </div>
            <div className="text-xs text-amber-200 md:text-sm">mood</div>
          </div>
          <div className="mt-1 text-xs text-slate-300">Week {currentWeek}</div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-slate-900/70">
        <CardHeader className="pb-2">
          <CardTitle className="bg-gradient-to-r from-pink-300 to-rose-300 bg-clip-text text-base text-transparent">
            Weekly Tallies
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {summaries.map((s) => {
            const pos = s.change >= 0
            return (
              <div
                key={s.week}
                className={cn(
                  "rounded-lg border bg-gradient-to-r from-slate-800/70 to-slate-700/50 p-3",
                  s.week === currentWeek
                    ? "border-blue-500/50 ring-1 ring-blue-500/20"
                    : "border-white/10"
                )}
              >
                <div className="flex items-center justify-between text-sm">
                  <div className="font-semibold text-sky-300">
                    Week {s.week}
                  </div>
                  <div className={pos ? "text-emerald-300" : "text-rose-300"}>
                    {pos ? "+" : "-"}
                    {Math.abs(s.change)} mood
                  </div>
                </div>
                <div className="mt-1 text-xs text-violet-200">
                  last: {s.lastMood}
                </div>
              </div>
            )
          })}
          {summaries.length === 0 && (
            <div className="text-sm text-slate-400">No weeks yet</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
