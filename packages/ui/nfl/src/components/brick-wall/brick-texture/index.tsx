import type { FC } from "react"
import type { BrickData } from "@nfl/types/brick-wall"

type BrickTextureProps = {
  brick: BrickData
  color: string
}

export const BrickTexture: FC<BrickTextureProps> = ({ brick, color }) => {
  const {
    position: { x, y, width, height },
  } = brick

  const depthEffect = height * 0.2

  return (
    <g>
      {/* Right side face for 3D effect */}
      <polygon
        points={`
        ${x + width},${y}
        ${x + width + depthEffect},${y + depthEffect}
        ${x + width + depthEffect},${y + height + depthEffect}
        ${x + width},${y + height}
        `}
        fill={color}
        stroke="#1e293b"
        strokeWidth="1"
        opacity="0.7"
      />

      {/* Top face for 3D effect */}
      <polygon
        points={`
        ${x},${y}
        ${x + depthEffect},${y + depthEffect}
        ${x + width + depthEffect},${y + depthEffect}
        ${x + width},${y}
        `}
        fill={color}
        stroke="#1e293b"
        strokeWidth="1"
        opacity="0.85"
      />

      {/* Detail lines to give brick texture */}
      <line
        x1={x + width * 0.2}
        y1={y + height * 0.3}
        x2={x + width * 0.2}
        y2={y + height * 0.7}
        stroke="#1e293b"
        strokeWidth="0.5"
        opacity="0.5"
      />
      <line
        x1={x + width * 0.4}
        y1={y + height * 0.2}
        x2={x + width * 0.4}
        y2={y + height * 0.8}
        stroke="#1e293b"
        strokeWidth="0.5"
        opacity="0.5"
      />
      <line
        x1={x + width * 0.6}
        y1={y + height * 0.25}
        x2={x + width * 0.6}
        y2={y + height * 0.75}
        stroke="#1e293b"
        strokeWidth="0.5"
        opacity="0.5"
      />
      <line
        x1={x + width * 0.8}
        y1={y + height * 0.35}
        x2={x + width * 0.8}
        y2={y + height * 0.65}
        stroke="#1e293b"
        strokeWidth="0.5"
        opacity="0.5"
      />
    </g>
  )
}
