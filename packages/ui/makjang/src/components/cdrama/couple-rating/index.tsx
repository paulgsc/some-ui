import type { FC } from "react"
import { useEffect, useRef, useState } from "react"
import { Heart, Sparkles, TrendingDown, TrendingUp } from "lucide-react"
import { cn } from "some-ui-utils"

type CoupleVibe =
  | "soulmates"
  | "slowburn"
  | "enemies-to-lovers"
  | "childhood-sweethearts"
  | "forbidden-love"
  | "second-chance"
  | "fake-dating"
  | "unrequited"

type CoupleRatingProps = {
  coupleName: string
  rating: number
  hypeVsActual: number
  mlRank: number
  flRank: number
  vibe?: CoupleVibe
}

const vibeConfig: Record<
  CoupleVibe,
  { emoji: string; label: string; gradient: string }
> = {
  soulmates: {
    emoji: "💕",
    label: "Soulmates",
    gradient: "from-pink-400 via-rose-400 to-red-400",
  },
  slowburn: {
    emoji: "🔥",
    label: "Slow Burn",
    gradient: "from-orange-400 via-red-400 to-pink-400",
  },
  "enemies-to-lovers": {
    emoji: "⚔️",
    label: "Enemies to Lovers",
    gradient: "from-purple-400 via-pink-400 to-red-400",
  },
  "childhood-sweethearts": {
    emoji: "🌸",
    label: "Childhood Sweethearts",
    gradient: "from-pink-300 via-rose-300 to-pink-400",
  },
  "forbidden-love": {
    emoji: "🌙",
    label: "Forbidden Love",
    gradient: "from-indigo-400 via-purple-400 to-pink-400",
  },
  "second-chance": {
    emoji: "🍃",
    label: "Second Chance",
    gradient: "from-emerald-400 via-teal-400 to-cyan-400",
  },
  "fake-dating": {
    emoji: "🎭",
    label: "Fake Dating",
    gradient: "from-violet-400 via-fuchsia-400 to-pink-400",
  },
  unrequited: {
    emoji: "💔",
    label: "Unrequited",
    gradient: "from-slate-400 via-gray-400 to-zinc-400",
  },
}

export const CoupleRating: FC<CoupleRatingProps> = ({
  coupleName,
  rating,
  hypeVsActual,
  mlRank,
  flRank,
  vibe = "soulmates",
}): React.JSX.Element => {
  const [animatedRating, setAnimatedRating] = useState(0)
  const [mounted, setMounted] = useState(false)
  const [showSparkles, setShowSparkles] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hypePercentage = Math.max(
    0,
    Math.min(100, ((hypeVsActual + 1) / 2) * 100)
  )
  const isHighRating = rating >= 7
  const isMidRating = rating >= 4 && rating < 7
  const isLowRating = rating < 4
  const isOverperforming = hypeVsActual >= 0

  const currentVibe = vibeConfig[vibe]

  useEffect(() => {
    // Mount animation
    timeoutRef.current = setTimeout(() => setMounted(true), 50)

    // Rating animation
    const duration = 1800
    const fps = 60
    const stepDuratoin = duration / fps
    const frames = (duration / 1000) * fps
    let currentFrame = 0

    intervalRef.current = setInterval(() => {
      currentFrame++
      const progress = currentFrame / frames
      const eased = 1 - Math.pow(1 - progress, 4) // Ease out quart
      setAnimatedRating(rating * eased)

      if (currentFrame >= frames) {
        if (intervalRef.current) clearInterval(intervalRef.current)
        setAnimatedRating(rating)

        // Show sparkles for high ratings
        if (isHighRating) {
          setShowSparkles(true)
          timeoutRef.current = setTimeout(() => setShowSparkles(false), 2000)
        }
      }
    }, stepDuratoin)

    return (): void => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [rating])

  const cardClasses = cn(
    "relative overflow-hidden rounded-3xl border-2 p-8 backdrop-blur-md transition-all duration-700",
    "shadow-2xl hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)]",
    mounted
      ? "opacity-100 translate-y-0 scale-100"
      : "opacity-0 translate-y-8 scale-95",
    isHighRating &&
      "border-[color:var(--primary)]/50 bg-gradient-to-br from-[color:var(--card)]/95 via-[color:var(--primary)]/5 to-[color:var(--accent)]/10",
    isMidRating &&
      "border-[color:var(--border)]/60 bg-gradient-to-br from-[color:var(--card)]/95 via-[color:var(--muted)]/20 to-[color:var(--secondary)]/15",
    isLowRating &&
      "border-[color:var(--destructive)]/40 bg-gradient-to-br from-[color:var(--card)]/95 via-[color:var(--destructive)]/5 to-[color:var(--muted)]/20"
  )

  const ratingColor = isHighRating
    ? "text-[color:var(--primary)]"
    : isMidRating
      ? "text-[color:var(--foreground)]"
      : "text-[color:var(--destructive)]"
  const glowEffect = isHighRating
    ? "drop-shadow-[var(--glow-primary)]"
    : isLowRating
      ? "drop-shadow-[var(--glow-destructive)]"
      : ""

  return (
    <div className="cdrama size-full px-6 py-2.5 flex items-center justify-center">
      <section className={cardClasses} style={{ animationDelay: "100ms" }}>
        {/* Decorative background sparkles */}
        {showSparkles && (
          <>
            <Sparkles className="absolute top-6 right-6 h-5 w-5 text-[color:var(--primary)]/40 animate-ping" />
            <Sparkles
              className="absolute bottom-8 left-8 h-4 w-4 text-[color:var(--accent)]/40 animate-ping"
              style={{ animationDelay: "300ms" }}
            />
            <Sparkles
              className="absolute top-1/2 right-12 h-3 w-3 text-[color:var(--primary)]/30 animate-ping"
              style={{ animationDelay: "600ms" }}
            />
          </>
        )}

        <div className="space-y-8">
          {/* Header with vibe */}
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Heart
                className={cn(
                  "h-7 w-7 transition-all duration-500",
                  isHighRating &&
                    "text-[color:var(--primary)] fill-[color:var(--primary)]/40 animate-pulse",
                  isMidRating &&
                    "text-[color:var(--muted-foreground)] fill-[color:var(--muted-foreground)]/20",
                  isLowRating &&
                    "text-[color:var(--destructive)]/70 fill-[color:var(--destructive)]/10",
                  glowEffect
                )}
              />
              <h1
                className={cn(
                  "font-mono text-sm font-extrabold uppercase tracking-[0.2em] transition-all duration-500",
                  isHighRating && "text-[color:var(--primary)]",
                  isMidRating && "text-[color:var(--foreground)]/70",
                  isLowRating && "text-[color:var(--destructive)]/80"
                )}
              >
                Couple Rating
              </h1>
            </div>

            {/* Vibe badge */}
            <div
              className={cn(
                "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold",
                "bg-gradient-to-r shadow-lg backdrop-blur-sm border border-white/20",
                currentVibe.gradient,
                "text-white"
              )}
            >
              <span className="text-lg">{currentVibe.emoji}</span>
              <span className="text-xs tracking-wide">{currentVibe.label}</span>
            </div>
          </header>

          {/* Couple Name */}
          <div className="text-center">
            <h2
              className={cn(
                "font-serif text-4xl font-bold leading-tight text-pretty transition-all duration-500",
                ratingColor,
                glowEffect
              )}
            >
              {coupleName}
            </h2>
          </div>

          {/* Rating Circle */}
          <div className="flex justify-center py-4">
            <div
              className={cn(
                "relative transition-all duration-700",
                mounted && "animate-in zoom-in-50",
                isHighRating && showSparkles && "animate-pulse"
              )}
            >
              <svg
                className="h-44 w-44 -rotate-90 drop-shadow-2xl"
                viewBox="0 0 160 160"
              >
                {/* Background circle */}
                <circle
                  cx="80"
                  cy="80"
                  r="70"
                  stroke="var(--muted)"
                  strokeWidth="12"
                  fill="none"
                  opacity="0.3"
                  className="transition-all"
                />

                {/* Animated rating circle */}
                <circle
                  cx="80"
                  cy="80"
                  r="70"
                  stroke={`url(#gradient-${vibe})`}
                  strokeWidth="12"
                  fill="none"
                  strokeDasharray={`${(animatedRating / 10) * 439.8} 439.8`}
                  strokeLinecap="round"
                  className={cn("transition-all duration-300", glowEffect)}
                />

                {/* Gradient definitions */}
                <defs>
                  <linearGradient
                    id={`gradient-${vibe}`}
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    {isHighRating && (
                      <>
                        <stop offset="0%" stopColor="var(--primary)" />
                        <stop offset="50%" stopColor="var(--accent)" />
                        <stop offset="100%" stopColor="var(--primary)" />
                      </>
                    )}
                    {isMidRating && (
                      <>
                        <stop offset="0%" stopColor="var(--secondary)" />
                        <stop
                          offset="100%"
                          stopColor="var(--muted-foreground)"
                        />
                      </>
                    )}
                    {isLowRating && (
                      <>
                        <stop offset="0%" stopColor="var(--destructive)" />
                        <stop offset="50%" stopColor="oklch(0.50 0.15 30)" />
                        <stop offset="100%" stopColor="var(--destructive)" />
                      </>
                    )}
                  </linearGradient>
                </defs>
              </svg>

              {/* Rating text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div
                  className={cn(
                    "font-serif text-5xl font-black tabular-nums transition-all duration-300",
                    ratingColor
                  )}
                >
                  {animatedRating.toFixed(1)}
                </div>
                <div className="font-mono text-xs font-bold uppercase tracking-widest text-[color:var(--muted-foreground)]">
                  out of 10
                </div>
              </div>
            </div>
          </div>

          {/* Hype vs Actual */}
          <div className="space-y-3 rounded-2xl bg-[color:var(--muted)]/30 p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isOverperforming ? (
                  <TrendingUp className="h-5 w-5 text-[color:var(--primary)]" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-[color:var(--destructive)]" />
                )}
                <span className="font-mono text-sm font-bold uppercase tracking-wide text-[color:var(--foreground)]/80">
                  Hype vs Actual
                </span>
              </div>
              <div
                className={cn(
                  "flex items-baseline gap-1 font-mono text-2xl font-black tabular-nums",
                  isOverperforming
                    ? "text-[color:var(--primary)]"
                    : "text-[color:var(--destructive)]",
                  glowEffect
                )}
              >
                {hypeVsActual > 0 && "+"}
                {(hypeVsActual * 100).toFixed(0)}
                <span className="text-sm font-semibold">%</span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="relative h-4 overflow-hidden rounded-full bg-[color:var(--muted)]/60 shadow-inner">
              <div
                className={cn(
                  "h-full rounded-full shadow-lg transition-all duration-1000 ease-out",
                  "bg-gradient-to-r",
                  isOverperforming
                    ? "from-[color:var(--primary)] via-[color:var(--accent)] to-[color:var(--primary)] bg-[length:200%_100%] animate-[cdrama-shimmer_3s_ease-in-out_infinite]"
                    : "from-[color:var(--destructive)] via-[oklch(0.50_0.15_30)] to-[color:var(--destructive)]"
                )}
                style={{
                  width: `${hypePercentage}%`,
                  transitionDelay: "300ms",
                }}
              />
            </div>
          </div>

          {/* Actor Rankings */}
          <div className="grid grid-cols-2 gap-6">
            <div
              className={cn(
                "group relative overflow-hidden rounded-2xl border-2 p-5 text-center backdrop-blur-sm",
                "transition-all duration-300 hover:-translate-y-1",
                isHighRating
                  ? "border-[color:var(--primary)]/40 bg-[color:var(--card)]/90 shadow-lg hover:border-[color:var(--primary)]/60 hover:shadow-[var(--glow-primary)]"
                  : "border-[color:var(--border)]/50 bg-[color:var(--card)]/80 shadow-md hover:border-[color:var(--border)] hover:shadow-lg"
              )}
            >
              <div className="relative z-10">
                <div className="font-mono text-xs font-bold uppercase tracking-widest text-[color:var(--muted-foreground)]">
                  Male Lead
                </div>
                <div
                  className={cn(
                    "mt-2 font-serif text-4xl font-black transition-all duration-300",
                    isHighRating &&
                      "text-[color:var(--primary)] group-hover:scale-110",
                    !isHighRating &&
                      "text-[color:var(--foreground)] group-hover:scale-105"
                  )}
                >
                  #{mlRank}
                </div>
              </div>
              {isHighRating && (
                <div className="absolute inset-0 bg-gradient-to-br from-[color:var(--primary)]/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              )}
            </div>

            <div
              className={cn(
                "group relative overflow-hidden rounded-2xl border-2 p-5 text-center backdrop-blur-sm",
                "transition-all duration-300 hover:-translate-y-1",
                isHighRating
                  ? "border-[color:var(--accent)]/40 bg-[color:var(--card)]/90 shadow-lg hover:border-[color:var(--accent)]/60 hover:shadow-[var(--glow-accent)]"
                  : "border-[color:var(--border)]/50 bg-[color:var(--card)]/80 shadow-md hover:border-[color:var(--border)] hover:shadow-lg"
              )}
            >
              <div className="relative z-10">
                <div className="font-mono text-xs font-bold uppercase tracking-widest text-[color:var(--muted-foreground)]">
                  Female Lead
                </div>
                <div
                  className={cn(
                    "mt-2 font-serif text-4xl font-black transition-all duration-300",
                    isHighRating &&
                      "text-[color:var(--accent)] group-hover:scale-110",
                    !isHighRating &&
                      "text-[color:var(--foreground)] group-hover:scale-105"
                  )}
                >
                  #{flRank}
                </div>
              </div>
              {isHighRating && (
                <div className="absolute inset-0 bg-gradient-to-br from-[color:var(--accent)]/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
