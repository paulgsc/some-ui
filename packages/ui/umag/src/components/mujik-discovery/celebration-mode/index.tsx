import type { FC } from "react"
import { useEffect, useRef, useState } from "react"
import { Sparkles, Star } from "lucide-react"
import { cn } from "some-ui-utils"

type CelebrationMode = {
  icon: React.ElementType
  color: string
  bgColor: string
  message: string
  description: string
  particles: number
  sparkles: number
}

type CelebrationProps = {
  mode: CelebrationMode
  selectedMode: string
  songTitle: string
  artist: string
}

export const CelebrationOverlay: FC<CelebrationProps> = ({
  mode,
  selectedMode,
  songTitle,
  artist,
}) => {
  const [isAnimating, setIsAnimating] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    setIsAnimating(true)

    timeoutRef.current = setTimeout(() => {
      setIsAnimating(false)
    }, 2500)

    return (): void => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [selectedMode])

  return (
    <>
      {selectedMode && isAnimating && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
          {Array.from({ length: mode.particles }).map((_, i) => (
            <div
              key={i}
              className={cn("confetti-burst absolute size-3")}
              style={{
                left: `${50 + (Math.random() - 0.5) * 70}%`,
                top: `${50 + (Math.random() - 0.5) * 70}%`,
                animationDelay: `${i * 0.08}s`,
                borderRadius: Math.random() > 0.5 ? "50%" : "0%",
                backgroundColor:
                  selectedMode === "new-find"
                    ? "#22d3ee"
                    : selectedMode === "rediscovery"
                      ? "#fbbf24"
                      : selectedMode === "struck-chord"
                        ? "#fb7185"
                        : "#facc15",
              }}
            />
          ))}

          {/* Sparkles */}
          {Array.from({ length: mode.sparkles }).map((_, i) => (
            <Sparkles
              key={`sparkle-${i}`}
              className={cn("sparkle absolute size-6", mode.color)}
              style={{
                left: `${45 + (Math.random() - 0.5) * 60}%`,
                top: `${45 + (Math.random() - 0.5) * 60}%`,
                animationDelay: `${i * 0.12}s`,
              }}
            />
          ))}

          {/* Card */}
          <div className="bg-card/95 border-border animate-in zoom-in-95 rounded-lg border p-6 shadow-2xl backdrop-blur-sm duration-500">
            <div className="mb-2 flex items-center gap-3">
              <div
                className={cn(
                  "flex size-10 items-center justify-center rounded-full",
                  mode.bgColor
                )}
              >
                <mode.icon className={cn("size-5", mode.color)} />
              </div>
              <div>
                <h3 className="text-card-foreground font-semibold">
                  {mode.message}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {mode.description}
                </p>
              </div>
            </div>

            <div className="bg-muted mt-3 rounded-md p-3">
              <p className="text-card-foreground text-sm font-medium">
                {songTitle}
              </p>
              <p className="text-muted-foreground text-xs">{artist}</p>
            </div>

            <div className={cn("mt-3 flex items-center gap-1", mode.color)}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className="size-3 animate-pulse fill-current"
                  style={{ animationDelay: `${i * 0.1}s` }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
