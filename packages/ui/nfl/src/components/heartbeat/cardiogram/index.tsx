import { useEffect, useState } from "react"

// Types for our team data
type PulseStatus = "healthy" | "normal" | "weak" | "critical" | "flatline"
type CategoryData = {
  name: string
  status: PulseStatus
  description: string
}

export const NFLTeamCardiogram = () => {
  // Selected category to display
  const [selectedCategory, setSelectedCategory] = useState<CategoryData>

  // SVG animation properties
  const [pulsePoints, setPulsePoints] = useState<string>("")
  const [pulseColor, setPulseColor] = useState<string>("#ffffff")
  const [pulseWidth, setPulseWidth] = useState<number>(3)
  const [animationDuration, setAnimationDuration] = useState<string>("3s")

  // Generate SVG path points based on status
  useEffect(() => {
    generatePulsePath(selectedCategory.status)
  }, [selectedCategory])

  // Generate appropriate pulse path based on status
  const generatePulsePath = (status: PulseStatus) => {
    let points = ""
    let strokeWidth = 3
    let duration = "3s"

    switch (status) {
      case "healthy":
        // Strong, regular heartbeat
        points = `M 30,100 
        L 60,100 
        L 65,65 
        L 70,135 
        L 75,85 
        L 85,100 
        L 120,100 
        L 125,70 
        L 130,130 
        L 135,85 
        L 140,100 
        L 170,100`
        duration = "2s"
        strokeWidth = 4
        break

      case "normal":
        // Normal heartbeat
        points = `M 30,100 
        L 70,100 
        L 80,70 
        L 90,130 
        L 100,100 
        L 140,100 
        L 150,80 
        L 160,120 
        L 170,100`
        duration = "2.5s"
        strokeWidth = 3
        break

      case "weak":
        // Weak heartbeat
        points = `M 30,100 
        L 80,100 
        L 90,85 
        L 100,115 
        L 110,95 
        L 120,100 
        L 170,100`
        duration = "3s"
        strokeWidth = 2.5
        break

      case "critical":
        // Irregular heartbeat
        points = `M 30,100 
        L 50,100 
        L 55,90 
        L 60,110 
        L 70,95 
        L 80,105 
        L 90,85 
        L 100,115 
        L 120,100 
        L 130,80 
        L 140,120 
        L 150,90 
        L 170,100`
        duration = "3.5s"
        strokeWidth = 2
        break

      case "flatline":
        // Flatline
        points = `M 30,100 L 170,100`
        duration = "4s"
        strokeWidth = 2
        break
    }

    setPulsePoints(points)
    setPulseColor("#ffffff") // White line like in the image
    setPulseWidth(strokeWidth)
    setAnimationDuration(duration)
  }

  return (
    <div className="mx-auto w-full max-w-4xl rounded-lg bg-gray-50 p-6 shadow-lg">
      {/* Circular Cardiogram visualization */}
      <div className="mb-8 flex justify-center">
        <div className="relative size-64">
          {/* Outer glow effect */}
          <div className="absolute inset-0 rounded-full bg-red-700 opacity-50 blur-xl"></div>

          {/* Metallic border with screws */}
          <svg viewBox="0 0 220 220" className="absolute inset-0 size-full">
            {/* Metallic ring */}
            <defs>
              <linearGradient
                id="metalGradient"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#c0c0c0" />
                <stop offset="50%" stopColor="#f0f0f0" />
                <stop offset="100%" stopColor="#a0a0a0" />
              </linearGradient>
              <radialGradient
                id="redGradient"
                cx="50%"
                cy="50%"
                r="50%"
                fx="50%"
                fy="50%"
              >
                <stop offset="0%" stopColor="#ff6b6b" />
                <stop offset="70%" stopColor="#e53e3e" />
                <stop offset="100%" stopColor="#c53030" />
              </radialGradient>
            </defs>

            {/* Outer metallic ring */}
            <circle
              cx="110"
              cy="110"
              r="107"
              fill="url(#metalGradient)"
              stroke="#888"
              strokeWidth="1"
            />
            <circle
              cx="110"
              cy="110"
              r="95"
              fill="url(#redGradient)"
              stroke="#730000"
              strokeWidth="2"
            />

            {/* Screws */}
            <circle
              cx="110"
              cy="15"
              r="5"
              fill="url(#metalGradient)"
              stroke="#555"
              strokeWidth="0.5"
            />
            <circle
              cx="110"
              cy="205"
              r="5"
              fill="url(#metalGradient)"
              stroke="#555"
              strokeWidth="0.5"
            />
            <circle
              cx="15"
              cy="110"
              r="5"
              fill="url(#metalGradient)"
              stroke="#555"
              strokeWidth="0.5"
            />
            <circle
              cx="205"
              cy="110"
              r="5"
              fill="url(#metalGradient)"
              stroke="#555"
              strokeWidth="0.5"
            />
            <circle
              cx="175"
              cy="45"
              r="5"
              fill="url(#metalGradient)"
              stroke="#555"
              strokeWidth="0.5"
            />
            <circle
              cx="45"
              cy="175"
              r="5"
              fill="url(#metalGradient)"
              stroke="#555"
              strokeWidth="0.5"
            />
            <circle
              cx="45"
              cy="45"
              r="5"
              fill="url(#metalGradient)"
              stroke="#555"
              strokeWidth="0.5"
            />
            <circle
              cx="175"
              cy="175"
              r="5"
              fill="url(#metalGradient)"
              stroke="#555"
              strokeWidth="0.5"
            />
          </svg>

          {/* Grid lines and EKG display */}
          <svg viewBox="0 0 200 200" className="absolute inset-0 size-full">
            {/* Grid lines */}
            <g opacity="0.3">
              {/* Vertical grid lines */}
              {[...Array(7)].map((_, i) => (
                <line
                  key={`vl-${i}`}
                  x1={40 + i * 20}
                  y1="40"
                  x2={40 + i * 20}
                  y2="160"
                  stroke="white"
                  strokeWidth="0.5"
                />
              ))}

              {/* Horizontal grid lines */}
              {[...Array(7)].map((_, i) => (
                <line
                  key={`hl-${i}`}
                  x1="40"
                  y1={40 + i * 20}
                  x2="160"
                  y2={40 + i * 20}
                  stroke="white"
                  strokeWidth="0.5"
                />
              ))}
            </g>

            {/* EKG line - centered horizontally on the red background */}
            <g
              className="ekg-line"
              style={{
                animation: `pulse-rotate ${animationDuration} infinite linear`,
              }}
            >
              <path
                d={pulsePoints}
                fill="none"
                stroke={pulseColor}
                strokeWidth={pulseWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>

            {/* Add animation for EKG line */}
            <style>{`
                @keyframes pulse-rotate {
                    0% {
                        transform: translateX(0);
                    }
                    100% {
                        transform: translateX(-60px);
                    }
                }
                `}</style>
          </svg>
        </div>
      </div>
    </div>
  )
}
