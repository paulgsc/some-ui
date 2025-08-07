import type { MoodEvent } from "@nfl/types/hopium-tracker"
import { computeStreak } from "@nfl/utils/mood"
import { Flame, Sparkles } from "lucide-react"
import { Card, CardContent } from "some-ui-shared"
import { cn } from "some-ui-utils"

type Props = {
  events: Array<MoodEvent>
  index: number
}

export const StreakCard = ({ events, index }: Props) => {
  const { direction, count, bestUp, bestDown } = computeStreak(events, index)
  const milestone = count > 0 && count % 5 === 0
  const up = direction === "up"
  const down = direction === "down"

  return (
    <Card
      className={cn(
        "relative size-full overflow-hidden border",
        up &&
          "border-emerald-600/30 bg-gradient-to-br from-emerald-900/40 to-cyan-900/30",
        down &&
          "border-rose-600/30 bg-gradient-to-br from-rose-900/40 to-orange-900/30",
        !up && !down && "border-white/10 bg-slate-900/60"
      )}
    >
      {/* Glow ring on milestone */}
      {milestone && (
        <div
          aria-hidden="true"
          className="absolute inset-0 animate-pulse"
          style={{
            boxShadow: up
              ? "0 0 0 2px rgba(16,185,129,0.25) inset, 0 0 60px rgba(16,185,129,0.25)"
              : "0 0 0 2px rgba(244,63,94,0.25) inset, 0 0 60px rgba(244,63,94,0.25)",
          }}
        />
      )}
      {/* Sparkles on milestone */}
      {milestone && (
        <div className="pointer-events-none absolute inset-0">
          <SparkleBurst />
        </div>
      )}

      <CardContent className="relative z-10 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame
              className={cn(
                "size-5",
                up
                  ? "text-emerald-300"
                  : down
                    ? "text-rose-300"
                    : "text-slate-300"
              )}
            />
            <div className="text-sm text-slate-200">Current Streak</div>
          </div>
          <div
            className={cn(
              "text-2xl font-extrabold",
              up
                ? "text-emerald-300"
                : down
                  ? "text-rose-300"
                  : "text-slate-200"
            )}
          >
            {count} {up ? "▲" : down ? "▼" : "—"}
          </div>
        </div>
        <div className="mt-2 text-xs text-slate-300">
          Direction:{" "}
          <span
            className={cn(up && "text-emerald-300", down && "text-rose-300")}
          >
            {up ? "Positive" : down ? "Negative" : "Neutral"}
          </span>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md border border-emerald-500/30 bg-emerald-900/20 px-2 py-1 text-emerald-200">
            Best Up: <span className="font-semibold">{bestUp}</span>
          </div>
          <div className="rounded-md border border-rose-500/30 bg-rose-900/20 px-2 py-1 text-rose-200">
            Best Down: <span className="font-semibold">{bestDown}</span>
          </div>
        </div>
        {milestone && (
          <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-amber-200">
            <Sparkles className="size-4 text-amber-300" />
            Milestone reached: {count} in a row!
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const SparkleBurst = () => {
  // Simple CSS-based sparkle burst
  return (
    <>
      <span className="absolute left-6 top-6 size-1 animate-[sparkle_1200ms_ease-in-out_infinite] rounded-full bg-amber-300" />
      <span className="absolute right-8 top-10 size-1.5 animate-[sparkle_1400ms_ease-in-out_infinite_200ms] rounded-full bg-fuchsia-300" />
      <span className="absolute bottom-6 left-12 size-1 animate-[sparkle_1000ms_ease-in-out_infinite_100ms] rounded-full bg-cyan-300" />
      <span className="absolute bottom-4 right-5 size-1 animate-[sparkle_1300ms_ease-in-out_infinite_50ms] rounded-full bg-rose-300" />
      <style>{`
                                                    @keyframes sparkle {
                                                                0% { transform: translateY(0) scale(0.8); opacity: 0.9; }
                                                                          50% { transform: translateY(-6px) scale(1.1); opacity: 1; }
                                                                                    100% { transform: translateY(0) scale(0.8); opacity: 0.9; }
                                                                                            }
                                                                                                  `}</style>
    </>
  )
}
