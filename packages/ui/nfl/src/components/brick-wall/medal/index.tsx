import type { FC } from "react"

type MedalProps = {
  x: number
  y: number
  size: number
  type: "gold" | "silver" | "bronze"
  ribbonHeight: number
}

// Medal component
export const Medal: FC<MedalProps> = ({ x, y, size, type, ribbonHeight }) => {
  // Medal colors
  const colors = {
    gold: { main: "#FFD700", edge: "#DAA520", ribbon: "#0047AB" },
    silver: { main: "#C0C0C0", edge: "#A9A9A9", ribbon: "#0047AB" },
    bronze: { main: "#CD7F32", edge: "#8B4513", ribbon: "#0047AB" },
  }

  const color = colors[type]
  const medalRadius = size / 2

  return (
    <g>
      {/* Ribbon */}
      <rect
        x={x - size / 8}
        y={0}
        width={size / 4}
        height={ribbonHeight}
        fill={color.ribbon}
      />

      {/* Medal outer circle */}
      <circle
        cx={x}
        cy={y}
        r={medalRadius}
        fill={color.main}
        stroke={color.edge}
        strokeWidth={size / 20}
      />

      {/* Medal inner details - sunburst pattern */}
      <g>
        {Array.from({ length: 16 }).map((_, i) => {
          const angle = (i * Math.PI * 2) / 16
          const innerRadius = medalRadius * 0.4
          const outerRadius = medalRadius * 0.9
          const x1 = x + Math.cos(angle) * innerRadius
          const y1 = y + Math.sin(angle) * innerRadius
          const x2 = x + Math.cos(angle) * outerRadius
          const y2 = y + Math.sin(angle) * outerRadius

          return (
            <line
              key={`ray-${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={color.edge}
              strokeWidth={size / 40}
            />
          )
        })}
      </g>

      {/* Medal inner circle */}
      <circle
        cx={x}
        cy={y}
        r={medalRadius * 0.35}
        fill={color.main}
        stroke={color.edge}
        strokeWidth={size / 40}
      />
    </g>
  )
}
