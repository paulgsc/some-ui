import type { JSX } from "react"
import { useEffect, useState } from "react"

type AngledEnergyBarProps = {
  progress: number
  color: "rust" | "typescript"
  isLow?: boolean
}

const THEMES = {
  rust: {
    bar: "rgb(220,85,60)",
    glow: "rgba(255,133,90,0.5)",
  },
  typescript: {
    bar: "rgb(45,118,215)",
    glow: "rgba(90,174,255,0.5)",
  },
} as const

export const AngledEnergyBar = ({
  progress,
  color,
  isLow = false,
}: AngledEnergyBarProps): JSX.Element => {
  const [pulse, setPulse] = useState(false)

  // Wave pulse on progress change
  useEffect(() => {
    setPulse(true)
    const timeout = setTimeout(() => setPulse(false), 600)
    return (): void => clearTimeout(timeout)
  }, [progress])

  const { bar, glow } = THEMES[color]
  const clipPath = "polygon(0 0, 98% 0, 100% 100%, 0 100%)"

  return (
    <div className={`relative h-8 w-full ${isLow ? "animate-tremble" : ""}`}>
      {/* Background container with angled edge */}
      <div
        className="absolute inset-0 overflow-hidden bg-muted/30 backdrop-blur-sm"
        style={{ clipPath }}
      >
        {/* Brushed texture overlay */}
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)`,
          }}
        />

        {/* Inner shadow at base */}
        <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-t from-black/30 to-transparent" />

        {/* Progress fill with angled edge */}
        <div
          className={`absolute inset-y-0 left-0 transition-all duration-500 ${
            pulse ? "animate-pulse" : ""
          }`}
          style={{
            width: `${progress}%`,
            background: `linear-gradient(to right, ${bar}, ${glow})`,
            clipPath,
            boxShadow: `inset 0 1px 2px rgba(255,255,255,0.2), 0 0 10px ${glow}`,
          }}
        >
          {/* Animated shine effect */}
          <div
            className="absolute inset-0 opacity-30 animate-shine"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",
            }}
          />
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes custom-shine {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes tremble {
          0% { transform: translateX(0); }
          25% { transform: translateX(-0.5px); }
          75% { transform: translateX(0.5px); }
          100% { transform: translateX(0); }
        }
        .animate-shine {
          animation: custom-shine 3s infinite;
        }
        .animate-tremble {
          animation: tremble 0.1s infinite;
        }
      `,
        }}
      />
    </div>
  )
}
