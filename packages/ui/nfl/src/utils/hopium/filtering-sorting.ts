export const applyFilter = <T>(
  items: Array<SatelliteDataItem<T>>,
  filter: FilterType
): Array<SatelliteDataItem<T>> => {
  switch (filter) {
    case "critical":
      return items.filter((item) => item.freshness < 30)
    case "fresh":
      return items.filter((item) => item.freshness >= 80)
    case "hidden":
      return [...items].sort((a, b) => a.freshness - b.freshness)
    case "all":
    default:
      return items
  }
}

export const applySorting = <T>(
  items: Array<SatelliteDataItem<T>>,
  sortBy: SortType
): Array<SatelliteDataItem<T>> => {
  return [...items].sort((a, b) => {
    switch (sortBy) {
      case "freshness":
        return a.freshness - b.freshness
      case "priority":
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
        return priorityOrder[a.priority] - priorityOrder[b.priority]
      case "name":
        return a.name.localeCompare(b.name)
      case "lastUpdated":
        return (
          new Date(a.lastUpdated).getTime() - new Date(b.lastUpdated).getTime()
        )
      default:
        return a.freshness - b.freshness
    }
  })
}

export const getVisibleItems = <T>(
  items: Array<SatelliteDataItem<T>>,
  filter: FilterType,
  sortBy: SortType,
  maxItems: number
): Array<SatelliteDataItem<T>> => {
  const filtered = applyFilter(items, filter)
  const sorted = applySorting(filtered, sortBy)
  return sorted.slice(0, maxItems)
}
