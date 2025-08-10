import { useEffect, useRef } from "react"
import type { MoodEvent } from "@nfl/types/hopium-tracker"
import { computeStreak } from "@nfl/utils/mood"
import { Flame, Sparkles } from "lucide-react"
import type { SparkleBurstHandle } from "some-ui-shared"
import { Card, CardContent, SparkleBurst } from "some-ui-shared"
import { cn } from "some-ui-utils"

type Props = {
  events: Array<MoodEvent>
  index: number
}

const SUCCESS_COLORS = ["#FDE68A", "#A7F3D0", "#C7D2FE", "#A5F3FC", "#FCD34D"]

export const StreakCard = ({ events, index }: Props) => {
  const { direction, count, bestUp, bestDown } = computeStreak(events, index)
  const burstRef = useRef<SparkleBurstHandle>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const lastMilestoneCount = useRef(0)

  const milestone = count > 0 && count % 5 === 0
  const up = direction === "up"
  const down = direction === "down"

  useEffect(() => {
    // Cancel any running sequence when component unmounts
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    // Only run if we hit a new milestone
    if (!milestone || count === lastMilestoneCount.current) return

    // Cancel any existing sequence
    abortControllerRef.current?.abort()

    // Start new sequence
    lastMilestoneCount.current = count
    const controller = new AbortController()
    abortControllerRef.current = controller

    const wait = (ms: number) =>
      new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          controller.signal.throwIfAborted() // Check if aborted before resolving
          resolve()
        }, ms)

        controller.signal.addEventListener("abort", () => {
          clearTimeout(timeout)
          reject(new DOMException("Aborted", "AbortError"))
        })
      })

    const runSequence = async () => {
      try {
        burstRef.current?.burstAtPercent(0.15, 0.25)
        await wait(250)
        burstRef.current?.burstAtPercent(0.85, 0.25)
        await wait(250)
        burstRef.current?.burstAtPercent(0.2, 0.75)
        await wait(250)
        burstRef.current?.burstAtPercent(0.8, 0.75)
        await wait(300)
        burstRef.current?.burstAtPercent(0.5, 0.5)
      } catch (error) {
        // Sequence was aborted, which is fine
        if (error.name !== "AbortError") {
          console.error("Sequence error:", error)
        }
      }
    }

    runSequence()
  }, [milestone, count])

  return (
    <Card
      className={cn(
        "relative size-full overflow-hidden border",
        "border-white/10 bg-slate-900/60",
        {
          "border-emerald-600/30 bg-gradient-to-br from-emerald-900/40 to-cyan-900/30":
            up,
          "border-rose-600/30 bg-gradient-to-br from-rose-900/40 to-orange-900/30":
            down,
        }
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
          <SparkleBurst
            ref={burstRef}
            autoPlay={false}
            particleCount={160}
            spread={110}
            gravity={0.22}
            drag={0.985}
            startVelocity={7.2}
            colors={SUCCESS_COLORS}
            origin="center"
            maxDurationMs={1700}
            showControls={false}
          />
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
