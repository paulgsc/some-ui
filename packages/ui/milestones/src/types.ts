/**
 * A milestone is deliberately not scoped to any one domain — "main went
 * green after two years of debt" and "ran a 10K without stopping" are the
 * same shape. `category` is a free-form label rather than a closed union so
 * a consumer never has to fork this type to log a kind of milestone this
 * package's author didn't anticipate.
 */
export type MilestoneTone = "joy" | "relief" | "grind" | "dread" | "rage"

export type MilestonePeriod = "previously" | "currently" | "upcoming"

export type MilestoneStat = {
  label: string
  value: string
}

export type Milestone = {
  id: string
  period: MilestonePeriod
  tone: MilestoneTone
  category: string
  title: string
  reflection: string
  timestamp: string
  stats?: ReadonlyArray<MilestoneStat>
}
