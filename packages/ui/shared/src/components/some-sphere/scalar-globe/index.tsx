import type { FC } from "react"
import { useEffect, useRef, useState } from "react"

type PolarSphereProps = {
  polarity?: number
  rotationSpeed?: number
  polarNum?: number
  width?: number
  height?: number
  radius?: number
}

export const PolarSphere = ({
  width,
  height,
  radius,
  polarNum,
  polarity = 2,
  rotationSpeed = 4,
}: PolarSphereProps): React.JSX.Element => {
  const { rotation } = useSphereAnimation(rotationSpeed)
  const args = {
    width,
    height,
    polarNum,
    polarity,
    rotation,
    radius,
  } satisfies SphereSVGProps

  return <SphereSVG {...args} />
}

type SphereSVGProps = {
  polarity: number
  rotation: number
  polarNum?: number
  width?: number
  height?: number
  radius?: number
}

export const SphereSVG = ({
  polarity,
  rotation,
  polarNum,
  width = 300,
  height = 300,
  radius = 100,
}: SphereSVGProps): React.JSX.Element => {
  const centerX = width / 2
  const centerY = height / 2

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="size-full">
      <SvgDefs centerX={centerX} centerY={centerY} radius={radius} />
      <g id="sphereGroup">
        <SphereBase centerX={centerX} centerY={centerY} radius={radius} />
        <LongitudeLines
          centerX={centerX}
          centerY={centerY}
          radius={radius}
          rotation={rotation}
        />
        <SphereHighlight centerX={centerX} centerY={centerY} radius={radius} />
      </g>
      <PolarityNumbers
        polarity={polarity}
        polarNum={polarNum}
        centerX={centerX}
        centerY={centerY}
        radius={radius}
        rotation={rotation}
      />
    </svg>
  )
}

type SvgDefsProps = {
  centerX: number
  centerY: number
  radius: number
}
export const SvgDefs: FC<SvgDefsProps> = ({ centerX, centerY, radius }) => {
  return (
    <defs>
      {/* Enhanced sphere gradient */}
      <radialGradient id="enhancedSphereGradient" cx="35%" cy="35%" r="100%">
        <stop offset="0%" stopColor="#80a0ff" />
        <stop offset="50%" stopColor="#5070dd" />
        <stop offset="85%" stopColor="#3050cc" />
        <stop offset="100%" stopColor="#2040aa" />
      </radialGradient>

      {/* Enhanced highlight gradient */}
      <radialGradient id="enhancedHighlightGradient" cx="25%" cy="25%" r="60%">
        <stop offset="0%" stopColor="rgba(255, 255, 255, 0.9)" />
        <stop offset="70%" stopColor="rgba(255, 255, 255, 0.3)" />
        <stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
      </radialGradient>

      {/* Improved shadow filter */}
      <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="12" />
        <feOffset dx="0" dy="15" result="offsetblur" />
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.4" />
        </feComponentTransfer>
        <feMerge>
          <feMergeNode />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      {/* Enhanced glow for the sphere */}
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="5" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>

      <clipPath id="sphereClip">
        <circle cx={centerX} cy={centerY} r={radius} />
      </clipPath>
    </defs>
  )
}

type SphereBaseProps = {
  centerX: number
  centerY: number
  radius: number
}

export const SphereBase: FC<SphereBaseProps> = ({
  centerX,
  centerY,
  radius,
}): React.JSX.Element => {
  return (
    <>
      {/* Main sphere */}
      <circle
        cx={centerX}
        cy={centerY}
        r={radius}
        fill="url(#enhancedSphereGradient)"
        filter="url(#shadow)"
      />

      {/* Add subtle inner shadow for more depth */}
      <circle
        cx={centerX}
        cy={centerY}
        r={radius}
        fill="none"
        stroke="rgba(0,0,0,0.15)"
        strokeWidth={2}
      />
    </>
  )
}

type SphereHighlightProps = {
  centerX: number
  centerY: number
  radius: number
}

export const SphereHighlight: FC<SphereHighlightProps> = ({
  centerX,
  centerY,
  radius,
}): React.JSX.Element => {
  return (
    <circle
      cx={centerX}
      cy={centerY}
      r={radius}
      fill="url(#highlightGradient)"
      opacity="0.5"
    />
  )
}

type LongitudeLinesProps = {
  centerX: number
  centerY: number
  radius: number
  rotation: number
}

export const LongitudeLines: FC<LongitudeLinesProps> = ({
  centerX,
  centerY,
  radius,
  rotation,
}): React.JSX.Element => {
  const numLongitudes = 4
  const numLatitudes = 8 // Adding latitude lines for better spherical appearance

  return (
    <g id="sphereGrid" clipPath="url(#sphereClip)">
      {/* Longitude lines */}
      {[...Array(numLongitudes)].map((_, i) => {
        const angle = (i / numLongitudes) * 360 - rotation
        const angleRad = (angle * Math.PI) / 180

        // Calculate visibility for this longitude based on its position
        const normalizedAngle = ((angle % 360) + 360) % 360
        const frontFacing = normalizedAngle > 180 && normalizedAngle < 360
        const distFromCenter = Math.min(
          Math.abs(normalizedAngle - 270),
          Math.abs(normalizedAngle - 90)
        )

        // Enhance visibility calculation for more realistic rendering
        const opacity = frontFacing
          ? 0.2 + 0.6 * Math.pow(Math.max(0, 1 - distFromCenter / 90), 2)
          : 0.05 + 0.25 * Math.pow(Math.max(0, 1 - distFromCenter / 90), 2)

        // Calculate stroke width for better 3D effect
        const strokeWidth = frontFacing ? 1.5 : 0.8

        // Generate path for longitude line
        let pathData = ""
        const steps = 60 // Increase steps for smoother curves

        for (let j = 0; j <= steps; j++) {
          // This is where we use proper spherical projection
          const theta = (j / steps) * Math.PI // Latitude angle from top to bottom

          // Get 3D coordinates on sphere
          const pointY = centerY + radius * Math.cos(theta)

          // Calculate proper x-coordinate for this longitude at this latitude
          const latRadius = radius * Math.sin(theta) // Radius at this latitude
          const pointX = centerX + latRadius * Math.cos(angleRad)

          pathData +=
            j === 0 ? `M ${pointX} ${pointY}` : ` L ${pointX} ${pointY}`
        }

        return (
          <path
            key={`long-${i}`}
            d={pathData}
            fill="none"
            stroke={`rgba(255, 255, 255, ${opacity})`}
            strokeWidth={strokeWidth}
          />
        )
      })}

      {/* Add latitude lines for enhanced spherical effect */}
      {[...Array(numLatitudes)].map((_, i) => {
        // Skip equator which would be at numLatitudes/2
        if (i === Math.floor(numLatitudes / 2)) return null

        // Calculate latitude angle
        const latAngle = (i / (numLatitudes - 1)) * Math.PI
        const y = centerY + radius * Math.cos(latAngle)

        // Calculate radius at this latitude
        const latRadius = radius * Math.sin(latAngle)

        // Calculate visibility based on position (latitude)
        // Latitudes near poles should be less visible
        const visibility = 0.1 + 0.4 * Math.sin(latAngle)

        return (
          <ellipse
            key={`lat-${i}`}
            cx={centerX}
            cy={y}
            rx={latRadius}
            ry={latRadius * 0.15} // Flatten to simulate perspective
            fill="none"
            stroke={`rgba(255, 255, 255, ${visibility})`}
            strokeWidth={0.8}
            strokeDasharray={i % 2 === 0 ? "4,4" : "none"}
          />
        )
      })}
    </g>
  )
}

type PolarityNumbersProps = {
  polarity: number
  centerX: number
  centerY: number
  radius: number
  rotation: number
  polarNum?: number
}
export const PolarityNumbers: FC<PolarityNumbersProps> = ({
  polarity,
  polarNum,
  centerX,
  centerY,
  radius,
  rotation,
}): React.JSX.Element => {
  return (
    <g id="numbers">
      {[...Array(polarity)].map((_, index) => {
        // Calculate the angle for this number around the sphere
        const angle =
          (index / polarity) * 2 * Math.PI + (rotation * Math.PI) / 180

        // Position the number along the equator of the sphere
        // This ensures it's on the plane formed by the longitude
        const x = Math.cos(angle) * radius * 0.7
        const z = Math.sin(angle) * radius * 0.7

        // The equator plane is at centerY
        const projectedX = centerX + x
        const projectedY = centerY

        // Calculate visibility based on z position
        // Numbers in front are fully visible, numbers in back fade out
        const visibility = Math.max(0, Math.min(1, z / radius + 0.5))

        // Determine if this number is in front or behind
        const isFront = z >= 0

        // Set z-index to ensure proper layering
        const zIndex = Math.floor(z * 100)

        const fontSize = radius * 0.475

        return (
          <g key={index} style={{ opacity: visibility }} data-z-index={zIndex}>
            <text
              x={projectedX}
              y={projectedY}
              fontSize={fontSize}
              fontWeight="bold"
              fill="white"
              textAnchor="middle"
              dominantBaseline="middle"
              filter="drop-shadow(0px 0px 2px rgba(0,0,0,0.8))"
              // Adjust scale based on z-position for perspective effect
              transform={`scale(${0.7 + 0.3 * ((z + radius) / (2 * radius))})`}
            >
              {polarNum ? polarNum : index + 1}
            </text>

            {/* Add a subtle indicator connecting the number to the sphere surface */}
            {isFront && (
              <line
                x1={centerX}
                y1={centerY}
                x2={projectedX}
                y2={projectedY}
                stroke="rgba(255, 255, 255, 0.2)"
                strokeWidth="1"
                strokeDasharray="2,3"
              />
            )}
          </g>
        )
      })}
    </g>
  )
}

export function useSphereAnimation(rotationSpeed: number): {
  rotation: number
} {
  const [rotation, setRotation] = useState(0)
  const animationFrameRef = useRef<number | null>(null)
  const lastTimeRef = useRef(0)

  useEffect(() => {
    const animate = (timestamp: number): void => {
      if (!lastTimeRef.current) {
        lastTimeRef.current = timestamp
      }

      const delta = timestamp - lastTimeRef.current
      lastTimeRef.current = timestamp

      setRotation((prevRotation) => {
        let currentRotation = prevRotation + (rotationSpeed * delta) / 16.67
        return currentRotation % 360
      })

      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return (): void => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [rotationSpeed])

  return { rotation }
}
