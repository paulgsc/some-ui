import type { FC } from "react"
import { useState } from "react"
import type { HangulCharacter } from "@honeycomb/types/hangul-types"

type HangulHexCellProps = {
  character: HangulCharacter
  centerX: number
  centerY: number
  cellWidth: number
  hexPath: string
  opacity?: number
  timeRemaining: number // 0 to 1
  showRomanization?: boolean // Whether to show hints
  isSolved?: boolean // Whether the character has been completed and locked in
}

const SOLVED_COLOR = "#22c55e" // emerald-500

export const HangulHexCell: FC<HangulHexCellProps> = ({
  character,
  centerX,
  centerY,
  cellWidth,
  hexPath,
  opacity = 1,
  timeRemaining,
  showRomanization = true,
  isSolved = false,
}): React.JSX.Element => {
  const [isHovered, setIsHovered] = useState(false)

  const hangulFontSize = Math.max(16, cellWidth * 0.35)
  const qwertyFontSize = Math.max(10, cellWidth * 0.18)

  // Progress ring
  const ringRadius = cellWidth * 0.42
  const ringStrokeWidth = 3
  const circumference = 2 * Math.PI * ringRadius
  // Solved cells show a full ring; active cells reflect remaining time.
  const progressOffset = isSolved ? 0 : circumference * (1 - timeRemaining)

  // Color intensity based on time remaining. Solved cells are always calm/green.
  const urgencyColor = isSolved
    ? SOLVED_COLOR
    : timeRemaining < 0.3
      ? "#ef4444"
      : character.color
  const glowIntensity =
    !isSolved && timeRemaining < 0.3 ? "url(#urgent-glow)" : "none"

  return (
    <g
      opacity={opacity}
      style={{ cursor: "pointer" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <defs>
        {/* Urgent glow filter for low time */}
        <filter id="urgent-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Hex background */}
      <path
        d={hexPath}
        fill={isSolved ? SOLVED_COLOR : character.color}
        fillOpacity={isSolved ? 0.22 : 0.3}
        stroke={urgencyColor}
        strokeWidth={isSolved ? 3 : 2}
        filter={glowIntensity}
      />

      {/* Progress ring */}
      <circle
        cx={centerX}
        cy={centerY}
        r={ringRadius}
        fill="none"
        stroke="rgba(255,255,255,0.2)"
        strokeWidth={ringStrokeWidth}
      />
      <circle
        cx={centerX}
        cy={centerY}
        r={ringRadius}
        fill="none"
        stroke={urgencyColor}
        strokeWidth={ringStrokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={progressOffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${centerX} ${centerY})`}
        style={{
          transition: "stroke-dashoffset 0.1s linear",
        }}
      />

      {/* Hangul character - large and centered */}
      <text
        x={centerX}
        y={centerY}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={hangulFontSize}
        fontWeight="900"
        fill="white"
        className="font-sans pointer-events-none"
        style={{
          textShadow: "0 2px 8px rgba(0,0,0,0.5)",
        }}
      >
        {character.hangul}
      </text>

      {/* QWERTY key hint - small text below (hidden once solved) */}
      <text
        x={centerX}
        y={centerY + cellWidth * 0.28}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={qwertyFontSize}
        fontWeight="700"
        fill="rgba(255,255,255,0.5)"
        className="font-mono pointer-events-none"
      >
        {!isSolved && showRomanization && character.qwertyKey}
      </text>

      {/* Completion checkmark badge */}
      {isSolved && (
        <text
          x={centerX + cellWidth * 0.28}
          y={centerY - cellWidth * 0.28}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={qwertyFontSize * 1.1}
          fontWeight="900"
          fill={SOLVED_COLOR}
          className="pointer-events-none"
          style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
        >
          ✓
        </text>
      )}

      {/* Hover popup with romanization */}
      {isHovered && showRomanization && (
        <foreignObject
          x={centerX - cellWidth * 0.6}
          y={centerY - cellWidth * 1.2}
          width={cellWidth * 1.2}
          height={cellWidth * 0.8}
          style={{ pointerEvents: "none" }}
        >
          <div
            className="rounded-lg p-2 bg-black/90 text-white shadow-xl text-xs leading-tight font-sans backdrop-blur-sm"
            style={{
              width: "100%",
              height: "100%",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <strong className="text-base mb-1">{character.hangul}</strong>
            <span className="opacity-80 font-mono text-sm">
              Key: {character.qwertyKey}
            </span>
            <span className="opacity-60 text-[10px] mt-1 italic">
              {character.romanization}
            </span>
          </div>
        </foreignObject>
      )}
    </g>
  )
}
