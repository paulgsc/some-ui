export type DialSection = {
  id: number
  title: string
  color: string
  details: string
}

export type SectionBounds = Record<"startAngle" | "endAngle", number>

export type AnimationPattern = "linear" | "bounce" | "elastic"
