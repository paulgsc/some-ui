import type { FC } from "react"
import { useEKGData } from "@nfl/hooks/use-ekg"
import type { EKGWaveParams } from "@nfl/types/ekg"

type EKGGraphProps = {
  width?: number
  height?: number
  maxPoints?: number
  pointSpacing?: number
}

const DEFAULT_EKG_PARAMS: EKGWaveParams = {
  heartRate: 75,
  pWaveHeight: 0.15,
  pWaveDuration: 0.1,
  qHeight: -0.05,
  rHeight: 1.0,
  sHeight: -0.1,
  qrsDuration: 0.08,
  tWaveHeight: 0.2,
  tWaveDuration: 0.2,
  baseline: 0,
  prInterval: 0.16,
  stSegmentDuration: 0.1,
}

export const EKGGraph: FC<EKGGraphProps> = ({
  width = 800,
  height = 250,
  maxPoints = 400,
  pointSpacing = 2,
}) => {
  const yOffset = height / 2
  const yScale = height / 3 // Adjust as needed for visual scaling.
  const points = useEKGData(DEFAULT_EKG_PARAMS, maxPoints, pointSpacing)

  const pathData = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${yOffset + p.y * yScale}`)
    .join(" ")

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMinYMid meet"
      className="bg-gray-50"
    >
      <pattern
        id="smallGrid"
        width="10"
        height="10"
        patternUnits="userSpaceOnUse"
      >
        <path
          d="M 10 0 L 0 0 0 10"
          fill="none"
          stroke="#e0e0e0"
          strokeWidth="0.5"
        />
      </pattern>
      <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
        <rect width="50" height="50" fill="url(#smallGrid)" />
        <path
          d="M 50 0 L 0 0 0 50"
          fill="none"
          stroke="#d0d0d0"
          strokeWidth="1"
        />
      </pattern>
      <rect width="100%" height="100%" fill="url(#grid)" />
      <path
        d={pathData}
        fill="none"
        stroke="#007bff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
