import type { FC } from "react"
import { useState } from "react"
import type { HangulCharacter } from "@honeycomb/types/hangul-types"

import "./index.css"

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
  /**
   * The cell is a not-yet-typed token of a multi-cell word (ADR 0003
   * §2(a)): glyph and QWERTY hint are masked. Always false for single jamo.
   */
  isPlaceholder?: boolean
  /**
   * The cell belongs to a word that expired unfinished. Outranks
   * `isPlaceholder` (the debrief reveals unreached jamo) and renders in the
   * incorrect register (red, struck, no checkmark).
   */
  isMissed?: boolean
}

const PLACEHOLDER_GLYPH = "?"

const SOLVED_COLOR = "#22c55e" // emerald-500
const MISSED_COLOR = "#ef4444" // red-500

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
  isPlaceholder = false,
  isMissed = false,
}): React.JSX.Element => {
  const [isHovered, setIsHovered] = useState(false)

  // A missed cell is always unmasked, whatever the cursor said.
  const isMasked = isPlaceholder && !isMissed

  const hangulFontSize = Math.max(16, cellWidth * 0.35)
  const qwertyFontSize = Math.max(10, cellWidth * 0.18)

  const ringRadius = cellWidth * 0.42
  const ringStrokeWidth = 3
  const circumference = 2 * Math.PI * ringRadius
  // Solved and missed cells show a full ring (their clock is over); active
  // cells show remaining time.
  const progressOffset =
    isSolved || isMissed ? 0 : circumference * (1 - timeRemaining)

  // By time remaining; solved is always green, missed always red.

  const urgencyColor = isMissed
    ? MISSED_COLOR
    : isSolved
      ? SOLVED_COLOR
      : timeRemaining < 0.3
        ? MISSED_COLOR
        : character.color
  const glowIntensity =
    isMissed || (!isSolved && timeRemaining < 0.3)
      ? "url(#urgent-glow)"
      : "none"

  return (
    <g
      opacity={opacity}
      style={{ cursor: "pointer" }}
      className={isMissed ? "hangul-cell-missed" : undefined}
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
        fill={
          isMissed ? MISSED_COLOR : isSolved ? SOLVED_COLOR : character.color
        }
        fillOpacity={isMissed ? 0.28 : isSolved ? 0.22 : isMasked ? 0.15 : 0.3}
        stroke={urgencyColor}
        strokeWidth={isSolved || isMissed ? 3 : 2}
        strokeDasharray={isMasked ? "4 3" : undefined}
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
        className={isMissed ? "hangul-ring-missed" : undefined}
        style={{
          transition: "stroke-dashoffset 0.1s linear",
        }}
      />

      {/* Hangul character - large and centered. Masked to a neutral
          placeholder glyph while this cell hasn't been reached yet (#425),
          and struck out in red once the word expired without reaching it. */}
      <text
        x={centerX}
        y={centerY}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={hangulFontSize}
        fontWeight="900"
        fill={
          isMissed
            ? MISSED_COLOR
            : isMasked
              ? "rgba(255,255,255,0.35)"
              : "white"
        }
        className={
          isMissed
            ? "font-sans pointer-events-none hangul-glyph-missed"
            : "font-sans pointer-events-none"
        }
        style={{
          textShadow: isMissed
            ? "0 0 10px rgba(239,68,68,0.85)"
            : "0 2px 8px rgba(0,0,0,0.5)",
          transition: "fill 0.2s ease-out",
        }}
      >
        {isMasked ? PLACEHOLDER_GLYPH : character.hangul}
      </text>

      {/* QWERTY key hint - small text below. Hidden once solved or still
          masked; a missed cell shows it, since "the key you needed" is the
          one thing worth carrying out of a miss. */}
      <text
        x={centerX}
        y={centerY + cellWidth * 0.28}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={qwertyFontSize}
        fontWeight="700"
        fill={isMissed ? "rgba(239,68,68,0.85)" : "rgba(255,255,255,0.5)"}
        className="font-mono pointer-events-none"
      >
        {(isMissed || (!isSolved && !isMasked && showRomanization)) &&
          character.qwertyKey}
      </text>

      {/* Missed badge - the counterpart to the completion checkmark, so a
          frozen board reads correct-vs-missed without any colour vision. */}
      {isMissed && (
        <text
          x={centerX + cellWidth * 0.28}
          y={centerY - cellWidth * 0.28}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={qwertyFontSize * 1.1}
          fontWeight="900"
          fill={MISSED_COLOR}
          className="pointer-events-none"
          style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
        >
          ✗
        </text>
      )}

      {/* Completion checkmark badge */}
      {isSolved && !isMissed && (
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

      {/* Hover popup with romanization (suppressed for a not-yet-reached
          placeholder cell - it must not leak the answer early) */}
      {isHovered && showRomanization && !isMasked && (
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
