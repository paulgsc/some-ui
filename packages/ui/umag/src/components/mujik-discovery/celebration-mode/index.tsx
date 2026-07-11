import type { ElementType, FC } from "react"
import { useState } from "react"
import type { DiscoveryMode } from "@umag/types/spectrum"
import { assertNever } from "@umag/utils/error"
import { Sparkles, Star } from "lucide-react"
import { cn } from "some-ui-utils"

type CelebrationMode = {
  icon: ElementType
  color: string
  bgColor: string
  message: string
  description: string
  particles: number
  sparkles: number
}

// 2. Update props to expect the constrained literal type
type CelebrationProps = {
  mode: CelebrationMode
  selectedMode: DiscoveryMode | "" // Allow empty string for the early-return conditional initial state
  songTitle: string
  artist: string
}

type Particle = {
  id: string
  left: number
  top: number
  borderRadius: string
  delay: number
}

type Sparkle = {
  id: string
  left: number
  top: number
  delay: number
}

// 3. Constrain parameter to fix compile-time exhaustiveness checks
function modeColor(mode: DiscoveryMode): string {
  switch (mode) {
    case "new-find": {
      return "#22d3ee"
    }
    case "rediscovery": {
      return "#fbbf24"
    }
    case "struck-chord": {
      return "#fb7185"
    }
    case "current-best": {
      return "#facc15"
    }
    default: {
      // TypeScript compile-time safety check
      mode satisfies never
      assertNever(mode)
    }
  }
}

function createParticles(count: number, modeKey: string): Array<Particle> {
  return Array.from({ length: count }, (_, i) => ({
    id: `particle-${modeKey}-${i}`,
    left: 50 + (Math.random() - 0.5) * 70,
    top: 50 + (Math.random() - 0.5) * 70,
    borderRadius: Math.random() > 0.5 ? "50%" : "0%",
    delay: i * 0.08,
  }))
}

function createSparkles(count: number, modeKey: string): Array<Sparkle> {
  return Array.from({ length: count }, (_, i) => ({
    id: `sparkle-${modeKey}-${i}`,
    left: 45 + (Math.random() - 0.5) * 60,
    top: 45 + (Math.random() - 0.5) * 60,
    delay: i * 0.12,
  }))
}

export const CelebrationOverlay: FC<CelebrationProps> = ({
  mode,
  selectedMode,
}) => {
  const [particles] = useState(() =>
    createParticles(mode.particles, selectedMode)
  )
  const [sparkles] = useState(() => createSparkles(mode.sparkles, selectedMode))

  if (!selectedMode) {
    return null
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="confetti-burst absolute size-3"
          style={{
            left: `${particle.left}%`,
            top: `${particle.top}%`,
            animationDelay: `${particle.delay}s`,
            borderRadius: particle.borderRadius,
            // selectedMode is safe to pass here because empty check is handled below hooks
            backgroundColor: modeColor(selectedMode),
          }}
        />
      ))}

      {sparkles.map((sparkle) => (
        <Sparkles
          key={sparkle.id}
          className={cn("sparkle absolute size-6", mode.color)}
          style={{
            left: `${sparkle.left}%`,
            top: `${sparkle.top}%`,
            animationDelay: `${sparkle.delay}s`,
          }}
        />
      ))}

      <div className={cn("mt-3 flex items-center gap-1", mode.color)}>
        {Array.from({ length: 5 }, (_, i) => (
          <Star
            key={`star-${i}`}
            className="size-3 animate-pulse fill-current"
            style={{
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
