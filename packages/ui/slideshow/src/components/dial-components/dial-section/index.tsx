import type { DialSection as DialSectionType } from "@slideshow/types/dial"

type DialSectionProps = {
  section: DialSectionType
  path: string
  radius: number
  isZoomed: boolean
  index: number
  setZoomedSection: (index: number | null) => void
  textPosition: { x: number; y: number; rotation: number }
}

export const DialPieSection = ({
  section,
  path,
  radius,
  isZoomed,
  index,
  setZoomedSection,
  textPosition,
}: DialSectionProps): React.JSX.Element => {
  const scale = isZoomed ? 1.05 : 1

  return (
    <g
      key={section.id}
      onMouseEnter={() => setZoomedSection(index)}
      onMouseLeave={() => setZoomedSection(null)}
      transform={`scale(${scale}) translate(${(1 - scale) * 50}, ${(1 - scale) * 50})`}
      style={{ transition: "transform 0.3s ease" }}
    >
      <path
        d={path}
        fill={section.color}
        stroke="#fff"
        strokeWidth="1"
        filter={
          isZoomed
            ? "drop-shadow(0px 4px 6px rgba(0,0,0,0.3))"
            : "drop-shadow(0px 2px 2px rgba(0,0,0,0.15))"
        }
      >
        <title>{section.title}</title>
      </path>

      {/* Section text */}
      <text
        x={textPosition.x}
        y={textPosition.y}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#333"
        fontSize={radius * 0.06}
        fontWeight="bold"
        transform={`rotate(${textPosition.rotation}, ${textPosition.x}, ${textPosition.y})`}
      >
        {section.title}
      </text>
    </g>
  )
}
