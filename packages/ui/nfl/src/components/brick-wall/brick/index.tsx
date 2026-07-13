import type { FC } from "react"
import { BrickTexture } from "@nfl/components/brick-wall/brick-texture"
import { NFLTeamIcon } from "@nfl/components/nfl-team-icon"
import type { BrickData } from "@nfl/types/brick-wall"
import { getTextColor, interpolateOklch } from "@nfl/utils/color-intensity"

type BrickProps = {
  brick: BrickData
}

export const Brick: FC<BrickProps> = ({ brick }) => {
  const {
    position: { x, y, width, height },
    item,
    maxValue,
    minValue,
    isBlank,
  } = brick

  if (isBlank) {
    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill="#f0f0f0"
          stroke="#ddd"
          strokeWidth="1"
          strokeDasharray="4 2"
        />
        <BrickTexture brick={brick} color="#f0f0f0" />
      </g>
    )
  }

  if (!item) return null
  const startColor: [number, number, number] = [80, 0.2, 270] // Light Purple
  const endColor: [number, number, number] = [40, 0.3, 150] // Dark Greenish Blue
  const { color, lightness } = interpolateOklch(
    item.value,
    minValue,
    maxValue,
    startColor,
    endColor
  )
  const textColor = getTextColor(lightness)

  const valueFontSize = Math.max(12, Math.min(10, width / 10))
  const iconSize = Math.min(width * 0.65, height * 0.65)

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={color}
        stroke="#000"
        strokeWidth="2"
      />
      <BrickTexture brick={brick} color={color} />
      <foreignObject
        x={x + width / 2 - iconSize / 2}
        y={y + height / 2 - iconSize / 2}
        width={iconSize}
        height={iconSize}
      >
        <NFLTeamIcon team={item.name} size={iconSize} />
      </foreignObject>
      <text
        x={x + width / 2}
        y={y + height - valueFontSize}
        textAnchor="middle"
        fontFamily="Arial"
        fontSize={valueFontSize}
        fill={textColor}
      >
        {item.value}
      </text>
    </g>
  )
}
