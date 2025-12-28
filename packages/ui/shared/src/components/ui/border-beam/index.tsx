import "./index.css"

import { useEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { AntSvg } from "@shared/components/icons/ant-svg"
import { cn } from "@shared/lib/utils"

type BorderBeamProps = {
  size?: number
  duration?: number
  delay?: number
  color?: string
  className?: string
  style?: React.CSSProperties
  reverse?: boolean
  showTrail?: boolean
  trailColorStart?: string
  trailColorEnd?: string
  trailWidth?: number
  trailOpacity?: number
  trailFadeDuration?: number
}

export const BorderBeam = ({
  className,
  size = 8,
  delay = 0,
  duration = 8,
  color = "#333333",
  style,
  reverse = false,
  showTrail = true,
  trailColorStart = "#ffaa40",
  trailColorEnd = "#9c40ff",
  trailWidth = 2,
  trailOpacity = 0.6,
  trailFadeDuration = 4,
}: BorderBeamProps): React.JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [isInitialized, setIsInitialized] = useState(false)
  const [trailLength, setTrailLength] = useState(0)
  const [gradientId] = useState(
    `gradient-${Math.random().toString(36).substring(2, 9)}`
  )

  useEffect(() => {
    if (!containerRef.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setDimensions({ width, height })

        const perimeter = 2 * (width + height)
        setTrailLength(perimeter)

        setIsInitialized(true)
      }
    })

    resizeObserver.observe(containerRef.current)
    return (): void => resizeObserver.disconnect()
  }, [])

  const cssVars = {
    "--ant-size": `${size}px`,
    "--ant-color": color,
    "--ant-duration": `${duration}s`,
    "--ant-delay": `${delay}s`,
    "--ant-direction": reverse ? "reverse" : "normal",
    "--trail-width": `${trailWidth}px`,
    "--trail-opacity": trailOpacity,
    "--trail-fade-duration": `${trailFadeDuration}s`,
    "--trail-color-start": trailColorStart,
    "--trail-color-end": trailColorEnd,
    "--container-width": `${dimensions.width}px`,
    "--container-height": `${dimensions.height}px`,
    "--trail-length": `${trailLength}px`,
  } as CSSProperties

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 z-[1000] overflow-hidden rounded-[inherit]"
      style={cssVars}
    >
      {/* Pheromone Trail */}
      {showTrail && isInitialized && (
        <svg
          className="absolute inset-0 size-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={trailColorStart} />
              <stop offset="100%" stopColor={trailColorEnd} />
            </linearGradient>
          </defs>
          <path
            d={`M ${size / 2} ${size / 2} H ${dimensions.width - size / 2} V ${dimensions.height - size / 2} H ${size / 2} Z`}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={trailWidth}
            strokeLinecap="round"
            className="trail-animation"
            style={{
              strokeDasharray: trailLength,
            }}
          />
        </svg>
      )}

      {/* Ant */}
      <div
        className={cn("ant-animation absolute", className)}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          top: 0,
          left: 0,
          transformOrigin: "center",
          ...style,
          ...(!isInitialized && { opacity: 0 }),
        }}
      >
        <AntSvg color={color} />
      </div>
    </div>
  )
}
