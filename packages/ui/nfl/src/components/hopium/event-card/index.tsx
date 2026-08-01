import type { JSX } from "react"
import type { MoodEvent } from "@nfl/types/hopium/hopium-tracker"
import { moodEmoji, moodLabel } from "@nfl/utils/hopium/mood"
import { Badge, Card, CardContent } from "@some-ui/shared"
import { TrendingDown, TrendingUp } from "lucide-react"
import { cn } from "some-ui-utils"

type Props = {
  event: MoodEvent | undefined
  keySeed?: number
}

export const EventCard = ({ event, keySeed }: Props): JSX.Element | null => {
  if (!event) return null
  const positive = event.delta >= 0

  return (
    <Card
      key={`${event.id}-${keySeed ?? ""}`}
      className={cn(
        "absolute inset-0 border-white/10 bg-slate-900/80",
        "transition-all duration-500",
        "translate-y-0 opacity-100"
      )}
    >
      <CardContent className="flex flex-1 justify-around p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className="border-fuchsia-500/30 bg-fuchsia-600/20 text-fuchsia-300"
                variant="outline"
              >
                Week {event.week}
              </Badge>
              <Badge
                className={
                  positive
                    ? "border-emerald-500/30 bg-emerald-600/20 text-emerald-300"
                    : "border-rose-500/30 bg-rose-600/20 text-rose-300"
                }
                variant="outline"
              >
                {positive ? "+" : "-"}
                {Math.abs(event.delta)} mood
              </Badge>
              <Badge
                className="border-indigo-500/30 bg-indigo-600/20 text-indigo-200"
                variant="outline"
              >
                {event.team}
              </Badge>
              <Badge
                className="border-amber-500/30 bg-amber-500/20 text-amber-200"
                variant="outline"
              >
                {event.category}
              </Badge>
            </div>
            <h3 className="mt-2 bg-gradient-to-r from-rose-300 via-amber-200 to-emerald-300 bg-clip-text text-base font-bold text-transparent">
              {event.label}
            </h3>
            <p className="mt-1 text-sm text-slate-200">{event.description}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-4xl">{moodEmoji(event.mood)}</div>
            <div className="text-xs text-slate-300">
              {moodLabel(event.mood)}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-sm">
          {positive ? (
            <TrendingUp className="size-4 text-emerald-400" />
          ) : (
            <TrendingDown className="size-4 text-rose-400" />
          )}
          <span className={positive ? "text-emerald-300" : "text-rose-300"}>
            {positive ? "+" : "-"}
            {Math.abs(event.delta)} to mood — now at{" "}
            <span className="font-semibold text-sky-300">{event.mood}</span>
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
