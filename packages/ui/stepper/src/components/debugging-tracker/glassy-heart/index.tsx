import { useEffect, useState } from "react"

interface GlassyHeartProps {
  health: number
  color: "rust" | "typescript"
}

export function GlassyHeart({ health, color }: GlassyHeartProps) {
  const [scale, setScale] = useState(1)

  // Subtle breathing animation
  useEffect(() => {
    const interval = setInterval(() => {
      setScale(1 + Math.sin(Date.now() / 1000) * 0.015)
    }, 50)

    return () => clearInterval(interval)
  }, [])

  // Color gradients based on health
  const getGradient = () => {
    if (color === "rust") {
      if (health > 70) return "from-[rgb(220,85,60)] to-[rgb(255,133,90)]"
      if (health > 40) return "from-[rgb(255,133,90)] to-[rgb(255,100,70)]"
      return "from-[rgb(255,100,70)] to-[rgb(255,77,79)]"
    } else {
      if (health > 70) return "from-[rgb(45,118,215)] to-[rgb(90,174,255)]"
      if (health > 40) return "from-[rgb(90,174,255)] to-[rgb(60,140,230)]"
      return "from-[rgb(60,140,230)] to-[rgb(45,106,240)]"
    }
  }

  const percentage = Math.round(health)

  return (
    <div className="relative" style={{ transform: `scale(${scale})` }}>
      {/* Glassy heart SVG */}
      <svg
        width="80"
        height="80"
        viewBox="0 0 80 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient
            id={`heartGradient-${color}`}
            x1="0%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <stop
              offset="0%"
              stopColor={
                color === "rust" ? "rgb(220,85,60)" : "rgb(45,118,215)"
              }
              stopOpacity={health > 70 ? "0.9" : health > 40 ? "0.7" : "0.5"}
            />
            <stop
              offset="100%"
              stopColor={
                color === "rust" ? "rgb(255,133,90)" : "rgb(90,174,255)"
              }
              stopOpacity={health > 70 ? "0.95" : health > 40 ? "0.75" : "0.6"}
            />
          </linearGradient>
          <filter id={`innerGlow-${color}`}>
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path
          d="M40 70C40 70 15 55 15 35C15 25 20 20 27.5 20C32.5 20 37 23 40 27C43 23 47.5 20 52.5 20C60 20 65 25 65 35C65 55 40 70 40 70Z"
          fill={`url(#heartGradient-${color})`}
          filter={`url(#innerGlow-${color})`}
          className="drop-shadow-lg"
        />
        {/* Glass highlight */}
        <path
          d="M30 28C30 28 32 25 35 25C37 25 38 26 38 28"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      </svg>

      {/* Percentage badge */}
      <div className="absolute -bottom-1 -right-1 bg-background border-2 border-current rounded-full w-8 h-8 flex items-center justify-center text-xs font-bold">
        {percentage}
      </div>
    </div>
  )
}
