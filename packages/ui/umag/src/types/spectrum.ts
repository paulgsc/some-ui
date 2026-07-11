export type SpectrumBarConfig = {
  id: number
  x: number
  baseHeight: number
  activeHeight: number
  width: number
  animationDelay: number
  frequency: number
}

export type DiscoveryMode =
  | "new-find"
  | "rediscovery"
  | "struck-chord"
  | "current-best"
