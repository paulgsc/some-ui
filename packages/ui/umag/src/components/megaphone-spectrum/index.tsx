import "./index.css"

import type { FC } from "react"
import { memo, useEffect, useMemo, useRef, useState } from "react"
import type { SpectrumBarConfig } from "@umag/types/spectrum" // Declare the SpectrumBarConfig variable
import { cn } from "some-ui-utils"

// Color presets array - moved inside component
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

// Fisher-Yates shuffle algorithm
const shuffleArray = (
  array: Array<(typeof COLOR_PRESETS)[number]>
): Array<(typeof COLOR_PRESETS)[number]> => {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

type MegaphoneSpectrumProps = {
  /** Additional CSS classes */
  className?: string
  /** Whether the spectrum animation is active */
  isActive: boolean
  /** Size of the component in pixels */
  size?: number
  /** Number of spectrum bars */
  barCount?: number
  /** Animation intensity (0-1) */
  intensity?: number
  /** Animation speed multiplier */
  speed?: number
  /** Accessibility label */
  ariaLabel?: string
  /** Callback when animation state changes */
  onAnimationChange?: (isActive: boolean) => void
  /** Callback when color preset changes */
  onColorChange?: (preset: {
    name: string
    primary: string
    accent: string
  }) => void
  /** Enable heartbeat effect */
  enableHeartbeat?: boolean
  /** Heartbeat intensity (0-1) */
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
    const [shuffledPresets, setShuffledPresets] = useState<
      Array<(typeof COLOR_PRESETS)[number]>
    >(() => shuffleArray([...COLOR_PRESETS]))
    const colorCycleRef = useRef<number | undefined>(undefined)
    const lastColorChangeRef = useRef<number>(0)

    // Validate and normalize props
    const normalizedProps = useMemo(
      () => ({
        size: Math.max(40, Math.min(200, size)),
        barCount: Math.max(6, Math.min(24, barCount)),
        intensity: Math.max(0, Math.min(1, intensity)),
        speed: Math.max(0.1, Math.min(3, speed)),
      }),
      [size, barCount, intensity, speed]
    )

    // Generate spectrum bars with enhanced mathematical distribution
    const spectrumBars = useMemo((): Array<SpectrumBarConfig> => {
      const { size: normalizedSize, barCount: normalizedBarCount } =
        normalizedProps

      return Array.from({ length: normalizedBarCount }, (_, i) => {
        const position = i / (normalizedBarCount - 1) // 0 to 1

        // Enhanced frequency distribution using multiple harmonics
        const fundamental = Math.sin(position * Math.PI)
        const harmonic1 = Math.sin(position * Math.PI * 2) * 0.3
        const harmonic2 = Math.sin(position * Math.PI * 3) * 0.15
        const frequency = fundamental + harmonic1 + harmonic2

        // Dynamic height calculation with better scaling
        const baseHeight = 6 + Math.abs(frequency) * 18
        const variationFactor = 1.2 + Math.sin(position * Math.PI * 4) * 0.4
        const activeHeight =
          baseHeight * variationFactor * (1 + intensity * 0.5)

        // Improved spacing and width calculation
        const barSpacing = (normalizedSize * 0.45) / normalizedBarCount
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

    // Use current preset instead of props
    const currentPreset = shuffledPresets[currentPresetIndex]
    const dynamicColor = currentPreset.primary
    const dynamicAccentColor = currentPreset.accent

    // Enhanced color calculations
    const colorValues = useMemo(() => {
      const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
        return result
          ? {
              r: Number.parseInt(result[1], 16),
              g: Number.parseInt(result[2], 16),
              b: Number.parseInt(result[3], 16),
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

    // Megaphone dimensions with better proportions
    const megaphoneConfig = useMemo(() => {
      const scale = normalizedProps.size / 80
      return {
        scale,
        x: normalizedProps.size * 0.58,
        y: normalizedProps.size * 0.38,
        waveOffset: normalizedProps.size * 0.32,
      }
    }, [normalizedProps.size])

    // Handle animation state changes
    useEffect(() => {
      if (previousActiveRef.current !== isActive) {
        onAnimationChange?.(isActive)
        previousActiveRef.current = isActive
      }
    }, [isActive, onAnimationChange])

    // Color cycling effect when active
    useEffect(() => {
      if (!isActive) {
        if (colorCycleRef.current) {
          cancelAnimationFrame(colorCycleRef.current)
          colorCycleRef.current = undefined
        }
        return
      }

      const cycleColors = (timestamp: number) => {
        if (timestamp - lastColorChangeRef.current >= 1000) {
          // Change every 1000ms (1 second)
          setCurrentPresetIndex((prevIndex) => {
            const nextIndex = prevIndex + 1
            if (nextIndex >= shuffledPresets.length) {
              // Reshuffle when we reach the end
              const newShuffled = shuffleArray([...COLOR_PRESETS])
              setShuffledPresets(newShuffled)
              // Schedule callback for next frame to avoid render cycle issues
              setTimeout(() => onColorChange?.(newShuffled[0]), 0)
              return 0
            }
            // Schedule callback for next frame to avoid render cycle issues
            setTimeout(() => onColorChange?.(shuffledPresets[nextIndex]), 0)
            return nextIndex
          })
          lastColorChangeRef.current = timestamp
        }

        if (isActive) {
          colorCycleRef.current = requestAnimationFrame(cycleColors)
        }
      }

      colorCycleRef.current = requestAnimationFrame(cycleColors)

      return (): void => {
        if (colorCycleRef.current) {
          cancelAnimationFrame(colorCycleRef.current)
        }
      }
    }, [isActive, shuffledPresets, onColorChange])

    // Handle initial color change when becoming active
    useEffect(() => {
      if (isActive && onColorChange) {
        // Set initial color when becoming active
        setTimeout(() => onColorChange(shuffledPresets[currentPresetIndex]), 0)
      }
    }, [isActive, currentPresetIndex, onColorChange, shuffledPresets]) // Only depend on isActive to avoid infinite loops

    return (
      <div
        className={cn(
          "relative transition-all duration-500 ease-out",
          "rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
          className,
          {
            // "opacity-100 scale-110 z-50": isActive,
            // "opacity-0 scale-90 -z-10": !isActive,
            heartbeat: isActive && enableHeartbeat,
          }
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
            {/* Enhanced gradient with multiple stops */}
            <linearGradient
              id={`spectrumGradient-${normalizedProps.size}`}
              x1="0%"
              y1="100%"
              x2="0%"
              y2="0%"
            >
              <stop offset="0%" stopColor={colorValues.primary} />
              <stop
                offset="30%"
                stopColor={colorValues.primary}
                stopOpacity="0.9"
              />
              <stop
                offset="70%"
                stopColor={colorValues.accent}
                stopOpacity="0.8"
              />
              <stop offset="100%" stopColor={colorValues.accent} />
            </linearGradient>

            {/* Improved glow filter */}
            <filter
              id={`glow-${normalizedProps.size}`}
              x="-50%"
              y="-50%"
              width="200%"
              height="200%"
            >
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feColorMatrix
                in="coloredBlur"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1.5 0"
              />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Radial gradient for background */}
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

          {/* Enhanced background with subtle animation */}
          <circle
            cx={normalizedProps.size / 2}
            cy={normalizedProps.size / 2}
            r={normalizedProps.size * 0.42}
            fill={`url(#bgGradient-${normalizedProps.size})`}
            className="transition-all duration-700 ease-out"
            style={{
              transform: isActive ? "scale(1.05)" : "scale(1)",
              opacity: isActive ? 1 : 0.3,
            }}
          />

          {/* Spectrum bars with enhanced animations and heartbeat */}
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
                filter={
                  isActive ? `url(#glow-${normalizedProps.size})` : "none"
                }
                className="transition-all duration-300 ease-out"
                style={{
                  transformOrigin: `${bar.x + bar.width / 2}px ${normalizedProps.size / 2}px`,
                  transform: `scaleY(${isActive ? 1 : 0.5})`,
                  transitionDelay: `${bar.animationDelay * 100}ms`,
                }}
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
                    <animate
                      attributeName="opacity"
                      values="0.7;1;0.8;1"
                      dur={`${1.2 / speed}s`}
                      repeatCount="indefinite"
                      begin={`${bar.animationDelay}s`}
                    />
                    {/* Heartbeat effect on bars */}
                    {enableHeartbeat && (
                      <animateTransform
                        attributeName="transform"
                        type="scale"
                        values={`1 1;1 ${1 + heartbeatIntensity * 0.15};1 1;1 ${1 + heartbeatIntensity * 0.25};1 1`}
                        dur={`${2.4 / speed}s`}
                        repeatCount="indefinite"
                        begin={`${bar.animationDelay * 2}s`}
                        keyTimes="0;0.14;0.28;0.42;1"
                        keySplines="0.4,0,0.6,1;0.4,0,0.6,1;0.4,0,0.6,1;0.4,0,0.6,1"
                      />
                    )}
                  </>
                )}
              </rect>
            ))}
          </g>

          {/* Enhanced megaphone with better details */}
          <g
            transform={`translate(${megaphoneConfig.x}, ${megaphoneConfig.y}) scale(${megaphoneConfig.scale})`}
          >
            {/* Main cone with gradient */}
            <defs>
              <linearGradient
                id={`megaphoneGradient-${normalizedProps.size}`}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="0%"
              >
                <stop
                  offset="0%"
                  stopColor={isActive ? colorValues.primary : "#6b7280"}
                />
                <stop
                  offset="100%"
                  stopColor={isActive ? colorValues.accent : "#4b5563"}
                />
              </linearGradient>
            </defs>

            <path
              d="M0 12 L18 4 L22 4 L22 20 L18 20 L0 12 Z"
              fill={`url(#megaphoneGradient-${normalizedProps.size})`}
              className="transition-all duration-500 ease-out"
            />

            {/* Enhanced speaker grille */}
            {[8, 10, 12, 14, 16].map((y, i) => (
              <rect
                key={i}
                x="19.5"
                y={y}
                width="2.5"
                height="1"
                rx="0.5"
                fill="white"
                opacity={isActive ? 0.6 : 0.3}
                className="transition-opacity duration-300"
              />
            ))}

            {/* Enhanced handle */}
            <rect
              x="-4"
              y="10"
              width="8"
              height="4"
              rx="2"
              fill={isActive ? colorValues.primary : "#6b7280"}
              className="transition-all duration-500 ease-out"
            />

            {/* Improved sound waves */}
            {isActive && (
              <g opacity="0.9">
                {[0, 1, 2].map((i) => (
                  <g key={i}>
                    <path
                      d={`M 24 ${12 - (i + 1) * 2} Q ${28 + i * 5} ${12 - (i + 1) * 4} 24 ${12 + (i + 1) * 2}`}
                      fill="none"
                      stroke={colorValues.primary}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      opacity="0"
                    >
                      <animate
                        attributeName="opacity"
                        values="0;0.9;0"
                        dur={`${1.8 / speed}s`}
                        repeatCount="indefinite"
                        begin={`${i * 0.4}s`}
                      />
                      <animateTransform
                        attributeName="transform"
                        type="scale"
                        values="0.6;1.4;0.6"
                        dur={`${1.8 / speed}s`}
                        repeatCount="indefinite"
                        begin={`${i * 0.4}s`}
                      />
                    </path>
                  </g>
                ))}
              </g>
            )}

            {/* Subtle vibration effect */}
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

          {/* Enhanced central pulse effect */}
          {isActive && (
            <>
              <circle
                cx={normalizedProps.size / 2}
                cy={normalizedProps.size / 2}
                r="1"
                fill={colorValues.primary}
                opacity="0"
              >
                <animate
                  attributeName="r"
                  values="1;25;1"
                  dur={`${2.5 / speed}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0.8;0;0.8"
                  dur={`${2.5 / speed}s`}
                  repeatCount="indefinite"
                />
              </circle>
              <circle
                cx={normalizedProps.size / 2}
                cy={normalizedProps.size / 2}
                r="1"
                fill={colorValues.accent}
                opacity="0"
              >
                <animate
                  attributeName="r"
                  values="1;20;1"
                  dur={`${2 / speed}s`}
                  repeatCount="indefinite"
                  begin="0.5s"
                />
                <animate
                  attributeName="opacity"
                  values="0.6;0;0.6"
                  dur={`${2 / speed}s`}
                  repeatCount="indefinite"
                  begin="0.5s"
                />
              </circle>
            </>
          )}

          {/* Heartbeat pulse rings */}
          {isActive && enableHeartbeat && (
            <g>
              {/* Primary heartbeat ring */}
              <circle
                cx={normalizedProps.size / 2}
                cy={normalizedProps.size / 2}
                r="3"
                fill="none"
                stroke={colorValues.primary}
                strokeWidth="2"
                opacity="0"
              >
                <animate
                  attributeName="r"
                  values="3;35;3"
                  dur={`${2.4 / speed}s`}
                  repeatCount="indefinite"
                  keyTimes="0;0.7;1"
                  keySplines="0.4,0,0.6,1;0.4,0,0.6,1"
                />
                <animate
                  attributeName="opacity"
                  values={`0;${heartbeatIntensity * 0.8};0`}
                  dur={`${2.4 / speed}s`}
                  repeatCount="indefinite"
                  keyTimes="0;0.3;1"
                  keySplines="0.4,0,0.6,1;0.4,0,0.6,1"
                />
                <animate
                  attributeName="stroke-width"
                  values="2;0.5;2"
                  dur={`${2.4 / speed}s`}
                  repeatCount="indefinite"
                  keyTimes="0;0.7;1"
                  keySplines="0.4,0,0.6,1;0.4,0,0.6,1"
                />
              </circle>

              {/* Secondary heartbeat ring with delay */}
              <circle
                cx={normalizedProps.size / 2}
                cy={normalizedProps.size / 2}
                r="3"
                fill="none"
                stroke={colorValues.accent}
                strokeWidth="1.5"
                opacity="0"
              >
                <animate
                  attributeName="r"
                  values="3;30;3"
                  dur={`${2.4 / speed}s`}
                  repeatCount="indefinite"
                  begin={`${0.4 / speed}s`}
                  keyTimes="0;0.6;1"
                  keySplines="0.4,0,0.6,1;0.4,0,0.6,1"
                />
                <animate
                  attributeName="opacity"
                  values={`0;${heartbeatIntensity * 0.6};0`}
                  dur={`${2.4 / speed}s`}
                  repeatCount="indefinite"
                  begin={`${0.4 / speed}s`}
                  keyTimes="0;0.4;1"
                  keySplines="0.4,0,0.6,1;0.4,0,0.6,1"
                />
              </circle>

              {/* Heartbeat glow effect */}
              <circle
                cx={normalizedProps.size / 2}
                cy={normalizedProps.size / 2}
                r={normalizedProps.size * 0.15}
                fill={colorValues.primaryAlpha(0.1)}
                opacity="0"
              >
                <animate
                  attributeName="opacity"
                  values={`0;${heartbeatIntensity * 0.4};0;${heartbeatIntensity * 0.6};0`}
                  dur={`${2.4 / speed}s`}
                  repeatCount="indefinite"
                  keyTimes="0;0.14;0.28;0.42;1"
                  keySplines="0.4,0,0.6,1;0.4,0,0.6,1;0.4,0,0.6,1;0.4,0,0.6,1"
                />
                <animateTransform
                  attributeName="transform"
                  type="scale"
                  values={`1;${1 + heartbeatIntensity * 0.3};1;${1 + heartbeatIntensity * 0.5};1`}
                  dur={`${2.4 / speed}s`}
                  repeatCount="indefinite"
                  keyTimes="0;0.14;0.28;0.42;1"
                  keySplines="0.4,0,0.6,1;0.4,0,0.6,1;0.4,0,0.6,1;0.4,0,0.6,1"
                />
              </circle>
            </g>
          )}
        </svg>

        {/* Screen reader status */}
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
