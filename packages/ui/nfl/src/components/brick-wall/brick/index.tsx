import { BrickTexture } from "@nfl/components/brick-wall/brick-texture"
import type { BrickData } from "@nfl/types/brick-wall"
import { getTextColor, interpolateOklch } from "@nfl/utils/color-intensity"

type BrickProps = {
  brick: BrickData
}

export const Brick: React.FC<BrickProps> = ({ brick }) => {
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

  if (!item) return <></>
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

  const nameFontSize = Math.max(8, Math.min(12, width / 8))
  const valueFontSize = Math.max(6, Math.min(10, width / 10))

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
      <text
        x={x + width / 2}
        y={y + height / 2}
        textAnchor="middle"
        fontFamily="Arial"
        fontSize={nameFontSize}
        fontWeight="bold"
        fill={textColor}
      >
        {item.name}
      </text>
      <text
        x={x + width / 2}
        y={y + height / 2 + nameFontSize + 2}
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
