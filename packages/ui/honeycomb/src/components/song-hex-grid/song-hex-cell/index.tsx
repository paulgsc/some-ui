import { useState } from "react"
import type { Song } from "@honeycomb/components/song-hex-grid/song-overlay"

type SongHexCellProps = {
  song: Song
  centerX: number
  centerY: number
  cellWidth: number
  hexPath: string
  opacity?: number
  imageUrl?: string
}

export function SongHexCell({
  song,
  centerX,
  centerY,
  cellWidth,
  hexPath,
  opacity = 1,
  imageUrl,
}: SongHexCellProps) {
  const [isHovered, setIsHovered] = useState(false)
  const uniqueId = `cell-${song.id}`

  const titleFontSize = Math.max(8, cellWidth * 0.16)
  const artistFontSize = Math.max(6, cellWidth * 0.12)
  const yearFontSize = Math.max(5, cellWidth * 0.085)
  const hexRadius = cellWidth * 0.45

  const textFill = "white"
  const truncated = (str: string, max: number) =>
    str.length > max ? str.slice(0, max - 2) + "…" : str

  return (
    <g
      opacity={opacity}
      style={{ cursor: "pointer" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <defs>
        {/* Hexagon clip for image fill */}
        <clipPath id={`hex-clip-${uniqueId}`}>
          <path d={hexPath} />
        </clipPath>

        {imageUrl && (
          <pattern
            id={`img-pattern-${uniqueId}`}
            patternUnits="userSpaceOnUse"
            x={centerX - hexRadius}
            y={centerY - hexRadius}
            width={hexRadius * 2}
            height={hexRadius * 2}
          >
            <image
              href={imageUrl}
              width={hexRadius * 2}
              height={hexRadius * 2}
              preserveAspectRatio="xMidYMid slice"
            />
          </pattern>
        )}
      </defs>

      {/* Hex background */}
      <path
        d={hexPath}
        fill={imageUrl ? `url(#img-pattern-${uniqueId})` : song.color}
        clipPath={imageUrl ? `url(#hex-clip-${uniqueId})` : undefined}
        stroke="rgba(255,255,255,0.2)"
        strokeWidth={1.5}
      />

      {/* Text content */}
      <g>
        <text
          x={centerX}
          y={centerY - cellWidth * 0.1}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={titleFontSize}
          fontWeight="700"
          fill={textFill}
          className="font-sans pointer-events-none"
        >
          {truncated(song.title, 14)}
        </text>

        <text
          x={centerX}
          y={centerY + cellWidth * 0.08}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={artistFontSize}
          fontWeight="500"
          fill={textFill}
          className="font-sans pointer-events-none"
        >
          {truncated(song.artist, 16)}
        </text>

        <text
          x={centerX}
          y={centerY + cellWidth * 0.22}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={yearFontSize}
          fontWeight="600"
          fill={textFill}
          className="font-mono pointer-events-none"
        >
          {song.releaseYear}
        </text>
      </g>

      {/* Hover popup (rich HTML inside SVG) */}
      {isHovered && (
        <foreignObject
          x={centerX - cellWidth * 0.7}
          y={centerY - cellWidth * 1.4}
          width={cellWidth * 1.4}
          height={cellWidth * 1.2}
          style={{ pointerEvents: "none" }}
        >
          <div
            className="rounded-xl p-2 bg-black/80 text-white shadow-lg text-xs leading-tight font-sans backdrop-blur-sm"
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
            <strong className="text-sm mb-1">{song.title}</strong>
            <span className="opacity-80">{song.artist}</span>
            <span className="opacity-60 text-[10px] mt-1">
              {song.releaseYear}
            </span>
            {song.genre && (
              <span className="opacity-70 mt-1 italic">{song.genre}</span>
            )}
          </div>
        </foreignObject>
      )}
    </g>
  )
}
