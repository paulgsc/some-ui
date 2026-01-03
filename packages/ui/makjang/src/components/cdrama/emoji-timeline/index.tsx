import { useEffect, useState } from "react"
import { Clock } from "lucide-react"
import { cn } from "some-ui-utils"

type EmojiReaction = {
  minute: number
  emoji: string
  context: string
}

type EmojiTimelineProps = {
  reactions: Array<EmojiReaction>
  currentMinute: number
  className?: string
}

export const EmojiTimeline = ({
  reactions,
  currentMinute,
  className,
}: EmojiTimelineProps) => {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div
      className={cn(
        className,
        "cdrama space-y-6 rounded-3xl border-2 p-6 shadow-xl transition-all duration-700",
        "border-[color:var(--cdrama-blossom)]",
        "bg-gradient-to-br from-[color:var(--card)] to-[color:var(--cdrama-surface)]",
        mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      )}
    >
      <div className="flex items-center gap-3">
        <Clock className="h-5 w-5 text-[color:var(--cdrama-blossom)]" />
        <h2 className="font-serif text-xl font-bold text-[color:var(--foreground)]">
          Instant Reactions
        </h2>
      </div>

      <div className="relative px-4">
        {/* Timeline bar background */}
        <div className="absolute left-0 top-12 h-1.5 w-full rounded-full bg-[color:var(--cdrama-surface)]">
          {/* Progress bar */}
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              "bg-gradient-to-r from-[color:var(--cdrama-blossom)] via-[color:var(--cdrama-accent)] to-[color:var(--cdrama-blossom)]"
            )}
            style={{ width: `${mounted ? (currentMinute / 45) * 100 : 0}%` }}
          >
            {/* Shimmer effect on progress */}
            <div className="h-full w-full animate-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          </div>
        </div>

        {/* Reactions */}
        <div className="relative space-y-2">
          <div className="flex justify-between">
            {reactions.map((reaction, index) => {
              const isPast = reaction.minute <= currentMinute
              const position = (reaction.minute / 45) * 100

              return (
                <div
                  key={index}
                  className="group relative flex flex-col items-center transition-all duration-300"
                  style={{
                    marginLeft:
                      index === 0
                        ? "0"
                        : `${position - ((reactions[index - 1]?.minute || 0) / 45) * 100}%`,
                  }}
                >
                  {/* Emoji bubble */}
                  <div
                    className={cn(
                      "relative z-10 flex h-20 w-20 items-center justify-center rounded-2xl border-2 text-4xl shadow-lg transition-all duration-500",
                      isPast
                        ? "scale-100 border-[color:var(--cdrama-blossom)] bg-[color:var(--card)] shadow-[0_0_20px_rgba(255,182,193,0.3)] hover:scale-110"
                        : "scale-90 border-[color:var(--border)] bg-[color:var(--cdrama-surface)] opacity-40"
                    )}
                  >
                    {reaction.emoji}

                    {/* Glow effect for active reactions */}
                    {isPast && (
                      <div className="absolute inset-0 -z-10 animate-pulse rounded-2xl bg-[color:var(--cdrama-blossom)] opacity-20 blur-xl" />
                    )}
                  </div>

                  {/* Time and context */}
                  <div className="mt-3 text-center">
                    <div
                      className={cn(
                        "font-mono text-xs font-bold transition-colors duration-300",
                        isPast
                          ? "text-[color:var(--cdrama-blossom)]"
                          : "text-[color:var(--muted-foreground)]"
                      )}
                    >
                      {reaction.minute}:00
                    </div>
                    <div
                      className={cn(
                        "mt-1 max-w-[100px] truncate font-mono text-xs transition-all duration-300",
                        isPast
                          ? "text-[color:var(--foreground)] opacity-100"
                          : "text-[color:var(--muted-foreground)] opacity-50"
                      )}
                    >
                      {reaction.context}
                    </div>
                  </div>

                  {/* Hover tooltip */}
                  <div
                    className={cn(
                      "pointer-events-none absolute -top-20 z-20 whitespace-nowrap rounded-xl border-2 px-4 py-2 font-mono text-sm shadow-xl transition-all duration-200",
                      "border-[color:var(--cdrama-blossom)] bg-[color:var(--card)] text-[color:var(--foreground)]",
                      "opacity-0 group-hover:opacity-100 group-hover:-translate-y-2"
                    )}
                  >
                    {reaction.context}
                    {/* Arrow */}
                    <div className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-8 border-transparent border-t-[color:var(--cdrama-blossom)]" />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Time markers */}
      <div className="flex justify-between px-4 font-mono text-xs text-[color:var(--muted-foreground)]">
        <span>0:00</span>
        <span>15:00</span>
        <span>30:00</span>
        <span>45:00</span>
      </div>
    </div>
  )
}
