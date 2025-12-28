import { useEffect, useState } from "react"

interface AngledEnergyBarProps {
  progress: number
  color: "rust" | "typescript"
  isLow?: boolean
}

export function AngledEnergyBar({
  progress,
  color,
  isLow = false,
}: AngledEnergyBarProps) {
  const [tremble, setTremble] = useState(0)
  const [pulse, setPulse] = useState(false)

  // Tremble effect when health is low
  useEffect(() => {
    if (isLow) {
      const interval = setInterval(() => {
        setTremble(Math.random() * 0.6 - 0.3)
      }, 50)
      return () => clearInterval(interval)
    } else {
      setTremble(0)
    }
  }, [isLow])

  // Wave pulse on progress change
  useEffect(() => {
    setPulse(true)
    const timeout = setTimeout(() => setPulse(false), 600)
    return () => clearTimeout(timeout)
  }, [progress])

  const barColor = color === "rust" ? "rgb(220,85,60)" : "rgb(45,118,215)"
  const glowColor =
    color === "rust" ? "rgba(255,133,90,0.5)" : "rgba(90,174,255,0.5)"

  return (
    <div
      className="relative h-8 w-full"
      style={{ transform: `translateX(${tremble}px)` }}
    >
      {/* Background container with angled edge */}
      <div
        className="absolute inset-0 bg-muted/30 backdrop-blur-sm overflow-hidden"
        style={{ clipPath: "polygon(0 0, 98% 0, 100% 100%, 0 100%)" }}
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
          className={`absolute inset-y-0 left-0 transition-all duration-500 ${pulse ? "animate-pulse" : ""}`}
          style={{
            width: `${progress}%`,
            background: `linear-gradient(to right, ${barColor}, ${glowColor})`,
            clipPath: "polygon(0 0, 98% 0, 100% 100%, 0 100%)",
            boxShadow: `inset 0 1px 2px rgba(255,255,255,0.2), 0 0 10px ${glowColor}`,
          }}
        >
          {/* Animated shine effect */}
          <div
            className="absolute inset-0 opacity-30"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",
              animation: "shine 3s infinite",
            }}
          />
        </div>
      </div>

      <style jsx>{`
        @keyframes shine {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(200%);
          }
        }
      `}</style>
    </div>
  )
}
