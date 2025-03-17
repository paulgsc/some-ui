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
  } = brick
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
  const depthEffect = height * 0.2

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
