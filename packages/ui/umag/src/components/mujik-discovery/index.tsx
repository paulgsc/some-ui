import type { ComponentType } from "react"
import { useState } from "react"
import { Clock, Heart, Sparkles, Star, Trophy, Zap } from "lucide-react"
import { Button } from "some-ui-shared"

type DiscoveryMode =
  | "new-find"
  | "rediscovery"
  | "struck-chord"
  | "current-best"

type DiscoveryModeConfig = {
  label: string
  icon: ComponentType<any>
  color: string
  bgColor: string
  message: string
  description: string
  particles: number
  sparkles: number
}

const discoveryModes: Record<DiscoveryMode, DiscoveryModeConfig> = {
  "new-find": {
    label: "New Discovery",
    icon: Zap,
    color: "text-cyan-400",
    bgColor: "bg-cyan-400/20",
    message: "Fresh Discovery Added!",
    description: "A brand new musical gem",
    particles: 15,
    sparkles: 10,
  },
  rediscovery: {
    label: "Rediscovery",
    icon: Clock,
    color: "text-amber-400",
    bgColor: "bg-amber-400/20",
    message: "Welcome Back, Old Friend!",
    description: "Reunited with a forgotten favorite",
    particles: 12,
    sparkles: 8,
  },
  "struck-chord": {
    label: "Struck a Chord",
    icon: Heart,
    color: "text-rose-400",
    bgColor: "bg-rose-400/20",
    message: "This One Hits Different!",
    description: "Deeply resonated with your soul",
    particles: 18,
    sparkles: 12,
  },
  "current-best": {
    label: "Current Best",
    icon: Trophy,
    color: "text-yellow-400",
    bgColor: "bg-yellow-400/20",
    message: "New Champion Crowned!",
    description: "Your current absolute favorite",
    particles: 20,
    sparkles: 15,
  },
}

type MusicDiscoveryButtonProps = {
  songTitle?: string
  artist?: string
  onSave?: (mode: DiscoveryMode) => void
}

export const MusicDiscoveryButton = ({
  songTitle = "Amazing Song",
  artist = "Great Artist",
  onSave,
}: MusicDiscoveryButtonProps) => {
  const [isAnimating, setIsAnimating] = useState(false)
  const [showCelebration, setShowCelebration] = useState(false)
  const [selectedMode, setSelectedMode] = useState<DiscoveryMode>("new-find")
  const [showModeSelector, setShowModeSelector] = useState(false)

  const currentMode = discoveryModes[selectedMode]

  const handleSave = async () => {
    if (isAnimating) return

    setIsAnimating(true)
    setShowCelebration(true)
    setShowModeSelector(false)

    // Mock API call
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Trigger celebration animation
    setTimeout(() => {
      setShowCelebration(false)
      setIsAnimating(false)
    }, 2500)

    onSave && onSave(selectedMode)
  }

  return (
    <div className="relative inline-block">
      {showModeSelector && (
        <div className="bg-card border-border absolute bottom-full left-0 z-10 mb-2 min-w-48 rounded-lg border p-2 shadow-xl">
          <div className="text-muted-foreground mb-2 px-2 text-xs font-medium">
            Choose discovery type:
          </div>
          {Object.entries(discoveryModes).map(([mode, config]) => {
            const IconComponent = config.icon
            return (
              <button
                key={mode}
                onClick={() => {
                  setSelectedMode(mode as DiscoveryMode)
                  setShowModeSelector(false)
                }}
                className={`hover:bg-muted flex w-full items-center gap-2 rounded-md p-2 text-left transition-colors ${
                  selectedMode === mode ? "bg-muted" : ""
                }`}
              >
                <IconComponent className={`size-4 ${config.color}`} />
                <div>
                  <div className="text-sm font-medium">{config.label}</div>
                  <div className="text-muted-foreground text-xs">
                    {config.description}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Main Save Button */}
      <div className="flex items-center gap-1">
        <Button
          onClick={() => setShowModeSelector(!showModeSelector)}
          variant="outline"
          size="sm"
          className="px-2"
          disabled={isAnimating}
        >
          <currentMode.icon className={`size-4 ${currentMode.color}`} />
        </Button>

        <Button
          onClick={handleSave}
          disabled={isAnimating}
          className={`
                            bg-primary hover:bg-primary/90
                            text-primary-foreground border-border/20 
                            relative
                            overflow-hidden border
                            shadow-lg transition-all
                            duration-300 hover:shadow-xl
                            ${isAnimating ? "pulse-glow" : ""}
                            `}
          size="sm"
        >
          <div className="flex items-center gap-2">
            <currentMode.icon
              className={`size-4 transition-all duration-300 ${isAnimating ? `${currentMode.color} scale-110` : ""}`}
              fill={isAnimating ? "currentColor" : "none"}
            />
            <span className="font-medium">
              {isAnimating ? "Saved!" : "Save Discovery"}
            </span>
          </div>

          {isAnimating && (
            <div
              className={`absolute inset-0 ${currentMode.bgColor} animate-pulse`}
            />
          )}
        </Button>
      </div>

      {showCelebration && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
          {/* Mode-specific confetti particles */}
          {Array.from({ length: currentMode.particles }).map((_, i) => (
            <div
              key={i}
              className={`confetti-burst absolute size-3`}
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

          {/* Mode-specific sparkle effects */}
          {Array.from({ length: currentMode.sparkles }).map((_, i) => (
            <Sparkles
              key={`sparkle-${i}`}
              className={`sparkle absolute size-6 ${currentMode.color}`}
              style={{
                left: `${45 + (Math.random() - 0.5) * 60}%`,
                top: `${45 + (Math.random() - 0.5) * 60}%`,
                animationDelay: `${i * 0.12}s`,
              }}
            />
          ))}

          <div className="bg-card/95 border-border animate-in zoom-in-95 rounded-lg border p-6 shadow-2xl backdrop-blur-sm duration-500">
            <div className="mb-2 flex items-center gap-3">
              <div
                className={`size-10 ${currentMode.bgColor} flex items-center justify-center rounded-full`}
              >
                <currentMode.icon className={`size-5 ${currentMode.color}`} />
              </div>
              <div>
                <h3 className="text-card-foreground font-semibold">
                  {currentMode.message}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {currentMode.description}
                </p>
              </div>
            </div>

            <div className="bg-muted mt-3 rounded-md p-3">
              <p className="text-card-foreground text-sm font-medium">
                {songTitle}
              </p>
              <p className="text-muted-foreground text-xs">{artist}</p>
            </div>

            <div
              className={`mt-3 flex items-center gap-1 ${currentMode.color}`}
            >
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
    </div>
  )
}
