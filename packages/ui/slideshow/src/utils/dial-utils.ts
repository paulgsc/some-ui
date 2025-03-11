type SectionPath = {
  startAngle: number
  endAngle: number
  innerRadius: number
  outerRadius: number
  center: number
}
export const generateSectionPath = ({
  startAngle,
  endAngle,
  innerRadius,
  outerRadius,
  center,
}: SectionPath): string => {
  const startRadians = (startAngle - 90) * (Math.PI / 180)
  const endRadians = (endAngle - 90) * (Math.PI / 180)

  const startOuterX = center + outerRadius * Math.cos(startRadians)
  const startOuterY = center + outerRadius * Math.sin(startRadians)
  const endOuterX = center + outerRadius * Math.cos(endRadians)
  const endOuterY = center + outerRadius * Math.sin(endRadians)

  const startInnerX = center + innerRadius * Math.cos(startRadians)
  const startInnerY = center + innerRadius * Math.sin(startRadians)
  const endInnerX = center + innerRadius * Math.cos(endRadians)
  const endInnerY = center + innerRadius * Math.sin(endRadians)

  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1

  return `
  M ${startOuterX} ${startOuterY}
  A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${endOuterX} ${endOuterY}
  L ${endInnerX} ${endInnerY}
  A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${startInnerX} ${startInnerY}
  Z
  `
}

type TextPosition = {
  sectionIndex: number
  sectionBoundaries: Array<Record<"startAngle" | "endAngle", number>>
  center: number
  radius: number
}
export const getSectionTextPosition = ({
  sectionIndex,
  sectionBoundaries,
  center,
  radius,
}: TextPosition): Record<"x" | "y" | "rotation", number> => {
  const { startAngle, endAngle } = sectionBoundaries[sectionIndex]
  const midAngle = (startAngle + endAngle) / 2
  const midRadians = (midAngle - 90) * (Math.PI / 180)

  const x = center + radius * Math.cos(midRadians)
  const y = center + radius * Math.sin(midRadians)

  const rotation = midAngle > 90 && midAngle < 270 ? midAngle + 180 : midAngle

  return { x, y, rotation }
}
