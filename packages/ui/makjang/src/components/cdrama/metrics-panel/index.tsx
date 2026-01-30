import { useEffect, useState } from "react"
import { Eye, Gauge, RotateCcw, TrendingUp } from "lucide-react"
import { cn } from "some-ui-utils"

type MetricsPanelProps = {
  overallRating: number
  likelihoodToFinish: number
  rewatchValue: number
}

const getRatingEmoji = (rating: number) => {
  if (rating >= 9) return "🌸"
  if (rating >= 7.5) return "💖"
  if (rating >= 6) return "💕"
  if (rating >= 4.5) return "💔"
  return "😢"
}

const getRatingLabel = (rating: number) => {
  if (rating >= 9) return "Masterpiece"
  if (rating >= 7.5) return "Excellent"
  if (rating >= 6) return "Good"
  if (rating >= 4.5) return "Mediocre"
  return "Disappointing"
}

export const MetricsPanel = ({
  overallRating,
  likelihoodToFinish,
  rewatchValue,
}: MetricsPanelProps) => {
  const [mounted, setMounted] = useState(false)
  const [animatedRating, setAnimatedRating] = useState(0)

  useEffect(() => {
    setMounted(true)
    // Animate rating counter
    const duration = 1000
    const steps = 60
    const increment = overallRating / steps
    let current = 0

    const timer = setInterval(() => {
      current += increment
      if (current >= overallRating) {
        setAnimatedRating(overallRating)
        clearInterval(timer)
      } else {
        setAnimatedRating(current)
      }
    }, duration / steps)

    return () => clearInterval(timer)
  }, [overallRating])

  return (
    <div
      className={cn(
        "cdrama space-y-5 rounded-sm border-2 px-6 py-2.5 shadow-xl transition-all duration-700",
        "border-[color:var(--cdrama-blossom)]",
        "bg-gradient-to-br from-[color:var(--card)] to-[color:var(--cdrama-surface)]",
        "size-full",
        mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      )}
    >
      <div className="flex items-center gap-3">
        <TrendingUp className="h-5 w-5 text-[color:var(--cdrama-blossom)]" />
        <h2 className="font-serif text-xl font-bold text-[color:var(--foreground)]">
          Engagement Metrics
        </h2>
      </div>

      <div className="space-y-4">
        {/* Overall Rating - Featured */}
        <div
          className={cn(
            "group relative overflow-hidden rounded-2xl border-2 p-6 transition-all duration-500",
            "border-[color:var(--cdrama-blossom)]",
            "bg-gradient-to-br from-[color:var(--cdrama-surface)] to-[color:var(--card)]",
            "hover:scale-[1.02] hover:shadow-lg hover:shadow-[color:var(--cdrama-blossom)]/20"
          )}
        >
          {/* Sparkle effect for high ratings */}
          {overallRating >= 8 && (
            <div className="absolute right-4 top-4 text-2xl animate-float">
              ✨
            </div>
          )}

          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[color:var(--cdrama-blossom)] to-[color:var(--cdrama-accent)] shadow-lg">
                  <Gauge className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="font-mono text-xs uppercase tracking-wider text-[color:var(--muted-foreground)]">
                    Overall Rating
                  </p>
                  <p className="font-serif text-sm font-medium text-[color:var(--cdrama-blossom)]">
                    {getRatingLabel(overallRating)}
                  </p>
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="flex items-baseline gap-2">
                <span className="text-5xl">
                  {getRatingEmoji(overallRating)}
                </span>
                <span className="font-mono text-5xl font-bold tabular-nums text-[color:var(--foreground)]">
                  {animatedRating.toFixed(1)}
                </span>
              </div>
              <p className="mt-1 font-mono text-sm text-[color:var(--muted-foreground)]">
                / 10.0
              </p>
            </div>
          </div>
        </div>

        {/* Likelihood to Finish */}
        <div
          className={cn(
            "group relative overflow-hidden rounded-2xl border p-5 transition-all duration-300",
            "border-[color:var(--border)]",
            "bg-[color:var(--card)]",
            "hover:border-[color:var(--cdrama-accent)] hover:shadow-md"
          )}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-[color:var(--cdrama-surface)] p-2">
                <Eye className="h-5 w-5 text-[color:var(--cdrama-accent)]" />
              </div>
              <span className="font-mono text-sm font-medium text-[color:var(--foreground)]">
                Likelihood to Finish
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-2xl font-bold text-[color:var(--foreground)]">
                {(likelihoodToFinish * 100).toFixed(0)}
              </span>
              <span className="font-mono text-sm text-[color:var(--muted-foreground)]">
                %
              </span>
            </div>
          </div>

          <div className="relative h-3 overflow-hidden rounded-full bg-[color:var(--cdrama-surface)]">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-1000 ease-out-quart",
                "bg-gradient-to-r from-[color:var(--cdrama-accent)] to-[color:var(--cdrama-blossom)]"
              )}
              style={{ width: `${mounted ? likelihoodToFinish * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Rewatch Value */}
        <div
          className={cn(
            "group relative overflow-hidden rounded-2xl border p-5 transition-all duration-300",
            "border-[color:var(--border)]",
            "bg-[color:var(--card)]",
            "hover:border-[color:var(--cdrama-blossom)] hover:shadow-md"
          )}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-[color:var(--cdrama-surface)] p-2">
                <RotateCcw className="h-5 w-5 text-[color:var(--cdrama-blossom)]" />
              </div>
              <span className="font-mono text-sm font-medium text-[color:var(--foreground)]">
                Rewatch Value
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-2xl font-bold text-[color:var(--foreground)]">
                {(rewatchValue * 100).toFixed(0)}
              </span>
              <span className="font-mono text-sm text-[color:var(--muted-foreground)]">
                %
              </span>
            </div>
          </div>

          <div className="relative h-3 overflow-hidden rounded-full bg-[color:var(--cdrama-surface)]">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-1000 ease-out-quart",
                "bg-gradient-to-r from-[color:var(--cdrama-blossom)] to-[color:var(--cdrama-accent)]"
              )}
              style={{ width: `${mounted ? rewatchValue * 100 : 0}%` }}
            />
            {rewatchValue >= 0.8 && (
              <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/30 to-transparent" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
