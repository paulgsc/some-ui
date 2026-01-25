import { Film, Play } from "lucide-react"
import { cn } from "some-ui-utils"

type DramaHeaderProps = {
  dramaId: string
  episodeNumber: number
  thumbnailUrl: string
  currentMinute: number
  className?: string
}

export const DramaHeader = ({
  dramaId,
  episodeNumber,
  thumbnailUrl,
  currentMinute,
  className,
}: DramaHeaderProps) => {
  const progress = (currentMinute / 45) * 100

  return (
    <div
      className={cn(
        className,
        "cdrama group relative overflow-hidden rounded-sm border-t-2 p-2.5 ps-4.5 shadow-2xl transition-all duration-700",
        "border-[color:var(--cdrama-blossom)]",
        "bg-gradient-to-br from-[color:var(--card)] via-[color:var(--cdrama-surface)] to-[color:var(--card)]",
        "size-full box-border"
      )}
    >
      {/* Animated background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,182,193,0.3),transparent_50%)] animate-pulse" />
      </div>

      {/* Shimmer effect */}
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent" />

      <div className="relative flex items-center gap-8">
        {/* Thumbnail with play overlay */}
        <div className="relative shrink-0 overflow-hidden rounded-2xl border-2 border-[color:var(--cdrama-blossom)] shadow-lg transition-all duration-300 hover:shadow-[0_0_30px_rgba(255,182,193,0.4)]">
          <div className="relative h-32 w-48 md:h32 md:w-48">
            <img
              src={
                thumbnailUrl ||
                "/placeholder.svg?height=128&width=192&query=cdrama episode thumbnail"
              }
              alt="Drama thumbnail"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

            {/* Play indicator */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--cdrama-blossom)] shadow-lg">
                <Play className="h-6 w-6 fill-white text-white" />
              </div>
            </div>

            {/* Progress bar at bottom */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
              <div
                className="h-full bg-gradient-to-r from-[color:var(--cdrama-blossom)] to-[color:var(--cdrama-accent)] transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Drama info */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[color:var(--cdrama-blossom)] to-[color:var(--cdrama-accent)] shadow-lg">
              <Film className="h-5 w-5 text-white" />
            </div>
            <h1 className="font-serif text-3xl font-bold tracking-tight text-[color:var(--foreground)] truncate transition-all duration-300 group-hover:text-[color:var(--cdrama-blossom)]">
              {dramaId
                .replace(/-/g, " ")
                .split(" ")
                .map(
                  (word) =>
                    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                )
                .join(" ")}
            </h1>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-medium text-[color:var(--cdrama-blossom)]">
                Episode
              </span>
              <span className="rounded-lg bg-[color:var(--cdrama-surface)] px-3 py-1 font-mono text-lg font-bold text-[color:var(--foreground)]">
                {episodeNumber}
              </span>
            </div>

            <div className="h-4 w-px bg-[color:var(--border)]" />

            <div className="flex items-center gap-2 font-mono text-sm text-[color:var(--muted-foreground)]">
              <span className="font-bold text-[color:var(--foreground)]">
                {currentMinute}:00
              </span>
              <span>/</span>
              <span>45:00</span>
            </div>
          </div>
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-3 rounded-full border-2 border-[color:var(--cdrama-blossom)] bg-[color:var(--card)] px-4 py-2 shadow-lg">
          <div className="relative h-3 w-3">
            <div className="absolute inset-0 animate-ping rounded-full bg-[color:var(--cdrama-blossom)] opacity-75" />
            <div className="relative h-3 w-3 rounded-full bg-[color:var(--cdrama-blossom)]" />
          </div>
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-[color:var(--cdrama-blossom)]">
            Live Tracking
          </span>
        </div>
      </div>
    </div>
  )
}
