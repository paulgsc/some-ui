import "./index.css"

import type { FC } from "react"
import { memo, useEffect, useMemo, useRef, useState } from "react"
import type { SpectrumBarConfig } from "@umag/types/spectrum"
import { cn } from "some-ui-utils"

const COLOR_PRESETS = [
  { name: "Ocean", primary: "#3b82f6", accent: "#8b5cf6" },
  { name: "Sunset", primary: "#ef4444", accent: "#f59e0b" },
  { name: "Forest", primary: "#10b981", accent: "#059669" },
  { name: "Purple", primary: "#8b5cf6", accent: "#a855f7" },
  { name: "Emerald", primary: "#10b981", accent: "#06b6d4" },
  { name: "Rose", primary: "#f43f5e", accent: "#ec4899" },
  { name: "Amber", primary: "#f59e0b", accent: "#eab308" },
  { name: "Cyan", primary: "#06b6d4", accent: "#0891b2" },
  { name: "Indigo", primary: "#6366f1", accent: "#8b5cf6" },
  { name: "Teal", primary: "#14b8a6", accent: "#0d9488" },
] as const

type ColorPreset = (typeof COLOR_PRESETS)[number]

const shuffleArray = (array: Array<ColorPreset>): Array<ColorPreset> => {
  const shuffled = [...array]
  for (const [i] of shuffled.entries()) {
    const j = Math.floor(Math.random() * (i + 1))
    const elementI = shuffled[i]
    const elementJ = shuffled[j]

    if (elementI !== undefined && elementJ !== undefined) {
      shuffled[i] = elementJ
      shuffled[j] = elementI
    }
  }
  return shuffled
}

type MegaphoneSpectrumProps = {
  className?: string
  isActive: boolean
  size?: number
  barCount?: number
  intensity?: number
  speed?: number
  ariaLabel?: string
  onAnimationChange?: (isActive: boolean) => void
  onColorChange?: (preset: ColorPreset) => void
  enableHeartbeat?: boolean
  heartbeatIntensity?: number
}

export const MegaphoneSpectrum: FC<MegaphoneSpectrumProps> = memo(
  ({
    isActive,
    className,
    size = 80,
    barCount = 12,
    intensity = 1,
    speed = 1,
    ariaLabel = "Audio spectrum visualization",
    onAnimationChange,
    onColorChange,
    enableHeartbeat = true,
    heartbeatIntensity = 0.6,
  }) => {
    const svgRef = useRef<SVGSVGElement>(null)
    const previousActiveRef = useRef(isActive)

    const [currentPresetIndex, setCurrentPresetIndex] = useState(0)
    const [shuffledPresets, setShuffledPresets] = useState<Array<ColorPreset>>(
      () => shuffleArray([...COLOR_PRESETS])
    )
    const colorCycleRef = useRef<number | undefined>(undefined)
    const lastColorChangeRef = useRef<number>(0)

    const normalizedProps = useMemo(
      () => ({
        size: Math.max(40, Math.min(200, size)),
        barCount: Math.max(6, Math.min(24, barCount)),
        intensity: Math.max(0, Math.min(1, intensity)),
        speed: Math.max(0.1, Math.min(3, speed)),
      }),
      [size, barCount, intensity, speed]
    )

    const spectrumBars = useMemo((): Array<SpectrumBarConfig> => {
      const { size: nSize, barCount: nBarCount } = normalizedProps

      return Array.from({ length: nBarCount }, (_, i) => {
        const position = i / (nBarCount - 1)
        const fundamental = Math.sin(position * Math.PI)
        const harmonic1 = Math.sin(position * Math.PI * 2) * 0.3
        const harmonic2 = Math.sin(position * Math.PI * 3) * 0.15
        const frequency = fundamental + harmonic1 + harmonic2

        const baseHeight = 6 + Math.abs(frequency) * 18
        const variationFactor = 1.2 + Math.sin(position * Math.PI * 4) * 0.4
        const activeHeight =
          baseHeight * variationFactor * (1 + intensity * 0.5)

        const barSpacing = (nSize * 0.45) / nBarCount
        const barWidth = Math.max(1.5, barSpacing * 0.7)

        return {
          id: i,
          x: 8 + i * barSpacing,
          baseHeight,
          activeHeight,
          width: barWidth,
          animationDelay: i * (0.06 / speed),
          frequency: Math.abs(frequency),
        }
      })
    }, [normalizedProps, intensity, speed])

    // Safe access to shuffledPresets
    const currentPreset =
      shuffledPresets[currentPresetIndex] ?? COLOR_PRESETS[0]
    const dynamicColor = currentPreset.primary
    const dynamicAccentColor = currentPreset.accent

    const colorValues = useMemo(() => {
      const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
        return result
          ? {
              r: parseInt(result[1] ?? "3b", 16),
              g: parseInt(result[2] ?? "82", 16),
              b: parseInt(result[3] ?? "f6", 16),
            }
          : { r: 59, g: 130, b: 246 }
      }

      const primary = hexToRgb(dynamicColor)
      const accent = hexToRgb(dynamicAccentColor)

      return {
        primary: `rgb(${primary.r}, ${primary.g}, ${primary.b})`,
        primaryAlpha: (alpha: number): string =>
          `rgba(${primary.r}, ${primary.g}, ${primary.b}, ${alpha})`,
        accent: `rgb(${accent.r}, ${accent.g}, ${accent.b})`,
        accentAlpha: (alpha: number): string =>
          `rgba(${accent.r}, ${accent.g}, ${accent.b}, ${alpha})`,
      }
    }, [dynamicColor, dynamicAccentColor])

    const megaphoneConfig = useMemo(() => {
      const scale = normalizedProps.size / 80
      return {
        scale,
        x: normalizedProps.size * 0.58,
        y: normalizedProps.size * 0.38,
      }
    }, [normalizedProps.size])

    useEffect(() => {
      if (previousActiveRef.current !== isActive) {
        onAnimationChange?.(isActive)
        previousActiveRef.current = isActive
      }
    }, [isActive, onAnimationChange])

    useEffect(() => {
      if (!isActive) {
        if (colorCycleRef.current) {
          cancelAnimationFrame(colorCycleRef.current)
          colorCycleRef.current = undefined
        }
        return
      }

      const cycleColors = (timestamp: number): void => {
        if (timestamp - lastColorChangeRef.current >= 1000) {
          setCurrentPresetIndex((prevIndex) => {
            const nextIndex = prevIndex + 1
            if (nextIndex >= shuffledPresets.length) {
              const newShuffled = shuffleArray([...COLOR_PRESETS])
              setShuffledPresets(newShuffled)
              const firstNew = newShuffled[0]
              if (firstNew) setTimeout(() => onColorChange?.(firstNew), 0)
              return 0
            }
            const nextPreset = shuffledPresets[nextIndex]
            if (nextPreset) setTimeout(() => onColorChange?.(nextPreset), 0)
            return nextIndex
          })
          lastColorChangeRef.current = timestamp
        }

        colorCycleRef.current = requestAnimationFrame(cycleColors)
      }

      colorCycleRef.current = requestAnimationFrame(cycleColors)

      return (): void => {
        if (colorCycleRef.current) cancelAnimationFrame(colorCycleRef.current)
      }
    }, [isActive, shuffledPresets, onColorChange])

    useEffect(() => {
      if (isActive && onColorChange) {
        const preset = shuffledPresets[currentPresetIndex]
        if (preset) setTimeout(() => onColorChange(preset), 0)
      }
    }, [isActive, currentPresetIndex, onColorChange, shuffledPresets])

    return (
      <div
        className={cn(
          "relative transition-all duration-500 ease-out rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500",
          className,
          { heartbeat: isActive && enableHeartbeat }
        )}
        style={
          {
            width: normalizedProps.size,
            height: normalizedProps.size,
            "--heartbeat-scale1": `${1 + heartbeatIntensity * 0.08}`,
            "--heartbeat-scale2": `${1 + heartbeatIntensity * 0.12}`,
            "--heartbeat-duration": `${2.4 / speed}s`,
          } as React.CSSProperties
        }
        role="img"
        aria-label={ariaLabel}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${normalizedProps.size} ${normalizedProps.size}`}
          className="size-full"
          style={{
            filter: isActive
              ? `drop-shadow(0 0 12px ${colorValues.primaryAlpha(0.4)}) drop-shadow(0 0 24px ${colorValues.primaryAlpha(0.2)})`
              : "none",
            transition: "filter 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          aria-hidden="true"
        >
          <defs>
            <linearGradient
              id={`spectrumGradient-${normalizedProps.size}`}
              x1="0%"
              y1="100%"
              x2="0%"
              y2="0%"
            >
              <stop offset="0%" stopColor={colorValues.primary} />
              <stop offset="100%" stopColor={colorValues.accent} />
            </linearGradient>
            <radialGradient
              id={`bgGradient-${normalizedProps.size}`}
              cx="50%"
              cy="50%"
              r="50%"
            >
              <stop offset="0%" stopColor={colorValues.primaryAlpha(0.1)} />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>

          <circle
            cx={normalizedProps.size / 2}
            cy={normalizedProps.size / 2}
            r={normalizedProps.size * 0.42}
            fill={`url(#bgGradient-${normalizedProps.size})`}
            style={{
              transform: isActive ? "scale(1.05)" : "scale(1)",
              opacity: isActive ? 1 : 0.3,
              transition: "all 0.7s ease-out",
            }}
          />

          <g>
            {spectrumBars.map((bar) => (
              <rect
                key={bar.id}
                x={bar.x}
                y={normalizedProps.size / 2}
                width={bar.width}
                height={isActive ? bar.activeHeight : bar.baseHeight}
                fill={`url(#spectrumGradient-${normalizedProps.size})`}
                rx={bar.width / 2}
                opacity={isActive ? 0.95 : 0.4}
                style={{
                  transformOrigin: `${bar.x + bar.width / 2}px ${normalizedProps.size / 2}px`,
                  transform: `scaleY(${isActive ? 1 : 0.5})`,
                  transitionDelay: `${bar.animationDelay * 100}ms`,
                }}
                className="transition-all duration-300 ease-out"
              >
                {isActive && (
                  <>
                    <animate
                      attributeName="height"
                      values={`${bar.baseHeight};${bar.activeHeight * (0.8 + bar.frequency * 0.4)};${bar.baseHeight * 0.7};${bar.activeHeight}`}
                      dur={`${0.8 / speed}s`}
                      repeatCount="indefinite"
                      begin={`${bar.animationDelay}s`}
                    />
                    {enableHeartbeat && (
                      <animateTransform
                        attributeName="transform"
                        type="scale"
                        values={`1 1;1 ${1 + heartbeatIntensity * 0.15};1 1;1 ${1 + heartbeatIntensity * 0.25};1 1`}
                        dur={`${2.4 / speed}s`}
                        repeatCount="indefinite"
                        begin={`${bar.animationDelay * 2}s`}
                        keyTimes="0;0.14;0.28;0.42;1"
                      />
                    )}
                  </>
                )}
              </rect>
            ))}
          </g>

          <g
            transform={`translate(${megaphoneConfig.x}, ${megaphoneConfig.y}) scale(${megaphoneConfig.scale})`}
          >
            <path
              d="M0 12 L18 4 L22 4 L22 20 L18 20 L0 12 Z"
              fill={isActive ? colorValues.primary : "#6b7280"}
              className="transition-all duration-500 ease-out"
            />
            {isActive && (
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0 0; 0.3 -0.2; -0.3 0.2; 0 0"
                dur={`${0.12 / speed}s`}
                repeatCount="indefinite"
              />
            )}
          </g>
        </svg>

        <div className="sr-only" aria-live="polite">
          {isActive
            ? "Audio visualization active"
            : "Audio visualization inactive"}
        </div>
      </div>
    )
  }
)

MegaphoneSpectrum.displayName = "MegaphoneSpectrum"
