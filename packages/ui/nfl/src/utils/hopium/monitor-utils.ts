export const getFreshnessColor = (freshness: number): string => {
  if (freshness >= 80) return "bg-primary"
  if (freshness >= 60) return "bg-secondary"
  if (freshness >= 40) return "bg-chart-2"
  if (freshness >= 20) return "bg-muted-foreground"
  return "bg-chart-3"
}

export const getFreshnessStatus = (freshness: number) => {
  if (freshness >= 80) return { label: "Fresh", variant: "default" as const }
  if (freshness >= 60) return { label: "Good", variant: "secondary" as const }
  if (freshness >= 40) return { label: "Aging", variant: "outline" as const }
  if (freshness >= 20)
    return { label: "Stale", variant: "destructive" as const }
  return { label: "Critical", variant: "destructive" as const }
}

export const getUrgencyClass = (
  freshness: number,
  priority: string
): string => {
  if (freshness < 30 && (priority === "high" || priority === "critical")) {
    return "animate-pulse-urgent border-destructive"
  }
  if (freshness < 50 && priority === "critical") {
    return "animate-fade-dying border-secondary"
  }
  return ""
}

export const calculateGridDimensions = (viewportSize: {
  width: number
  height: number
}) => {
  const headerHeight = 200 // Approximate header + stats height
  const availableHeight = viewportSize.height - headerHeight - 48 // 48px for padding
  const availableWidth = viewportSize.width - 48 // 48px for padding

  const minCardSize = 180 // Minimum card size
  const gap = 16 // Gap between cards

  const cols = Math.floor((availableWidth + gap) / (minCardSize + gap))
  const rows = Math.floor((availableHeight + gap) / (minCardSize + gap))

  return {
    cols: Math.max(1, cols),
    rows: Math.max(1, rows),
    maxItems: Math.max(1, cols * rows),
  }
}
