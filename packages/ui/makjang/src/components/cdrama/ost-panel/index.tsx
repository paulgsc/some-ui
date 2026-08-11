import type { FC } from "react"
import { startTransition, useEffect, useState } from "react"
import type { Appearance } from "@some-ui/styles/theme"
import { appearanceClassName } from "@some-ui/styles/theme"
import { Disc3, Music, Star } from "lucide-react"
import { cn } from "some-ui-utils"

const BAR_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]

type OSTPanelProps = {
  score: number
  ranking: number
  favoriteTrack: string
  /**
   * Art direction. `inherit` — the default — renders in whatever theme the
   * host established, so switching the session theme moves this component
   * with it. Pass `"cdrama"` to opt into the standalone C-drama palette,
   * which replaces the substrate for this subtree.
   */
  appearance?: Appearance
}

const getOSTEmoji = (score: number): string => {
  if (score >= 9) return "🎵"
  if (score >= 7.5) return "🎼"
  if (score >= 6) return "🎶"
  return "🎤"
}

export const OSTPanel: FC<OSTPanelProps> = ({
  score,
  ranking,
  favoriteTrack,
  appearance = "inherit",
}): React.JSX.Element => {
  const [mounted, setMounted] = useState(false)
  const [visualizerBars, setVisualizerBars] = useState<Array<number>>([])

  useEffect(() => {
    startTransition(() => setMounted(true))
    // Initialize visualizer bars
    startTransition(() =>
      setVisualizerBars(
        Array(16)
          .fill(0)
          .map((): number => Math.random() * 100)
      )
    )

    // Animate visualizer bars
    const interval = setInterval(() => {
      setVisualizerBars((prev) => prev.map(() => Math.random() * 100))
    }, 500)

    return (): void => clearInterval(interval)
  }, [])

  return (
    <div
      className={cn(
        appearanceClassName(appearance),
        "space-y-5 rounded-3xl border-2 p-6 shadow-xl transition-all duration-700",
        "border-[color:var(--cdrama-accent)]",
        "bg-gradient-to-br from-[color:var(--card)] to-[color:var(--cdrama-surface)]",
        mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[color:var(--cdrama-accent)] to-[color:var(--cdrama-blossom)] shadow-lg">
          <Music className="h-5 w-5 text-white" />
        </div>
        <h2 className="font-serif text-xl font-bold text-[color:var(--foreground)]">
          OST Evaluation
        </h2>
      </div>

      <div className="space-y-4">
        {/* Score - Featured */}
        <div
          className={cn(
            "group relative overflow-hidden rounded-2xl border-2 p-5 transition-all duration-300",
            "border-[color:var(--cdrama-accent)]",
            "bg-gradient-to-br from-[color:var(--cdrama-surface)] to-[color:var(--card)]",
            "hover:scale-[1.02] hover:shadow-lg hover:shadow-[color:var(--cdrama-accent)]/20"
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{getOSTEmoji(score)}</span>
              <span className="font-mono text-sm font-medium text-[color:var(--foreground)]">
                OST Score
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Star className="h-6 w-6 fill-[color:var(--cdrama-accent)] text-[color:var(--cdrama-accent)]" />
              <div className="text-right">
                <span className="font-mono text-4xl font-bold text-[color:var(--foreground)]">
                  {score.toFixed(1)}
                </span>
                <span className="ml-1 font-mono text-sm text-[color:var(--muted-foreground)]">
                  / 10
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Ranking */}
        <div
          className={cn(
            "rounded-xl border p-4 transition-all duration-300",
            "border-[color:var(--border)]",
            "bg-[color:var(--card)]",
            "hover:border-[color:var(--cdrama-accent)] hover:shadow-md"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm font-medium text-[color:var(--foreground)]">
              Personal Ranking
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-3xl font-bold text-[color:var(--cdrama-accent)]">
                #{ranking}
              </span>
            </div>
          </div>
        </div>

        {/* Favorite Track */}
        <div
          className={cn(
            "group rounded-xl border p-4 transition-all duration-300",
            "border-[color:var(--border)]",
            "bg-[color:var(--card)]",
            "hover:border-[color:var(--cdrama-blossom)] hover:shadow-md"
          )}
        >
          <div className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-[color:var(--muted-foreground)]">
            <Disc3 className="h-3 w-3" />
            Favorite Track
          </div>
          <div className="flex items-center gap-3">
            <div className="relative h-3 w-3">
              <div className="absolute inset-0 animate-ping rounded-full bg-[color:var(--cdrama-blossom)] opacity-75" />
              <div className="relative h-3 w-3 rounded-full bg-[color:var(--cdrama-blossom)]" />
            </div>
            <span className="font-mono text-sm font-medium text-[color:var(--foreground)] group-hover:text-[color:var(--cdrama-blossom)]">
              {favoriteTrack}
            </span>
          </div>
        </div>

        {/* Visualizer */}
        <div
          className={cn(
            "rounded-xl border p-4 transition-all duration-300",
            "border-[color:var(--border)]",
            "bg-[color:var(--card)]"
          )}
        >
          <div className="flex h-20 items-end justify-center gap-1">
            {BAR_INDICES.map((barId) => (
              <div
                key={barId}
                className={cn(
                  "w-1.5 rounded-full transition-all duration-500 ease-out",
                  "bg-gradient-to-t from-[color:var(--cdrama-accent)] via-[color:var(--cdrama-blossom)] to-[color:var(--cdrama-accent)]"
                )}
                style={{
                  height: `${visualizerBars[barId] ?? 0}%`,
                  opacity: 0.7 + ((visualizerBars[barId] ?? 0) / 100) * 0.3,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
