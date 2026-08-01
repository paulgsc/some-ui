import type { JSX } from "react"
import { useState } from "react"
import { SatelliteCard } from "@nfl/components/hopium/monitor/event-card"
import { DetailModal } from "@nfl/components/hopium/monitor/modal"
import { StatsCard } from "@nfl/components/hopium/monitor/stats-card"
import { useSatelliteData } from "@nfl/hooks/hopium/use-hopium-data"
import { useViewport } from "@nfl/hooks/hopium/use-viewport"
import type {
  ApiAdapter,
  FilterType,
  SatelliteDataItem,
  SortType,
} from "@nfl/types/hopium/hopium-tracker"
import { getVisibleItems } from "@nfl/utils/hopium/filtering-sorting"
import {
  Activity,
  AlertTriangle,
  RefreshCw,
  Satellite,
  TrendingDown,
} from "lucide-react"
import { Badge, Button } from "@some-ui/shared"

// Accept a generic T for the underlying satellite data payload, defaulting to unknown
type SatelliteDashboardProps<T = unknown> = {
  adapter: ApiAdapter<T>
  title?: string
  autoRefreshInterval?: number
}

function isSortType(value: string): value is SortType {
  return ["freshness", "priority", "name", "lastUpdated"].includes(value)
}

// Declare the component as generic over T
export const SatelliteDashboard = <T,>({
  adapter,
  title = "Satellite Data Monitor",
  autoRefreshInterval = 3000,
}: SatelliteDashboardProps<T>): JSX.Element => {
  // Bind the state item to the same inner payload type T
  const [selectedItem, setSelectedItem] = useState<SatelliteDataItem<T> | null>(
    null
  )
  const [activeFilter, setActiveFilter] = useState<FilterType>("all")
  const [sortBy, setSortBy] = useState<SortType>("freshness")

  const { dataItems, isRefreshing, refreshAll, refreshItem } = useSatelliteData(
    adapter,
    [],
    autoRefreshInterval
  )
  const { gridDimensions } = useViewport()

  // Initialize data on first load
  useState(() => {
    void refreshAll({
      onFailure: (error: Error) => {
        // eslint-disable-next-line no-console
        console.error("[v0] Failed to load initial data:", error)
      },
    })
  })

  const { cols, rows, maxItems } = gridDimensions
  const visibleItems = getVisibleItems(
    dataItems,
    activeFilter,
    sortBy,
    maxItems
  )
  const hiddenItemsCount = dataItems.length - visibleItems.length

  const handleRefreshAll = (): void => {
    void refreshAll({
      onFailure: (error) => {
        // eslint-disable-next-line no-console
        console.error("[v0] Refresh all failed:", error)
      },
    })
  }

  const handleRefreshItem = (id: string): void => {
    void refreshItem(id, {
      onFailure: (error, itemId) => {
        // eslint-disable-next-line no-console
        console.error(`[v0] Failed to refresh ${itemId}:`, error)
      },
    })
  }

  const criticalItems = dataItems.filter((item) => item.freshness < 30).length
  const avgFreshness =
    dataItems.reduce((sum, item) => sum + item.freshness, 0) / dataItems.length

  const handleFilterClick = (filter: FilterType): void => {
    setActiveFilter(activeFilter === filter ? "all" : filter)
  }

  return (
    <div className="bg-background flex h-screen flex-col overflow-hidden">
      <div className="flex-none space-y-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-foreground font-serif text-3xl font-bold">
              {title}
            </h1>
            <p className="text-muted-foreground">
              Real-time tracking • {visibleItems.length} of {dataItems.length}{" "}
              items shown
              {activeFilter !== "all" && (
                <Badge variant="outline" className="ml-2 capitalize">
                  {activeFilter} filter
                </Badge>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <select
              value={sortBy}
              onChange={(e) => {
                const value = e.target.value
                if (isSortType(value)) {
                  setSortBy(value)
                }
              }}
              className="bg-background rounded-md border px-3 py-2 text-sm"
            >
              <option value="freshness">Sort by Urgency</option>
              <option value="priority">Sort by Priority</option>
              <option value="name">Sort by Name</option>
              <option value="lastUpdated">Sort by Last Updated</option>
            </select>
            <Button
              onClick={handleRefreshAll}
              disabled={isRefreshing}
              className="gap-2 bg-[oklch(0.647_0.204_50.847)]"
            >
              <RefreshCw
                className={`size-4 ${isRefreshing ? "animate-spin" : ""}`}
              />
              {isRefreshing ? "Refreshing..." : "Refresh All"}
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4">
          <StatsCard
            title="Total Items"
            value={dataItems.length}
            icon={Satellite}
            filter="all"
            activeFilter={activeFilter}
            onClick={handleFilterClick}
          />
          <StatsCard
            title="Critical"
            value={criticalItems}
            icon={AlertTriangle}
            filter="critical"
            activeFilter={activeFilter}
            onClick={handleFilterClick}
            variant="destructive"
          />
          <StatsCard
            title="Hidden"
            value={hiddenItemsCount}
            icon={TrendingDown}
            filter="hidden"
            activeFilter={activeFilter}
            onClick={handleFilterClick}
            variant="secondary"
          />
          <StatsCard
            title="Avg Fresh"
            value={`${Math.round(avgFreshness)}%`}
            icon={Activity}
            filter="fresh"
            activeFilter={activeFilter}
            onClick={handleFilterClick}
          />
        </div>
      </div>

      {/* Grid Display */}
      <div className="flex-1 overflow-hidden px-6 pb-6">
        <div
          className="grid h-full gap-4"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
          }}
        >
          {visibleItems.map((item) => (
            <SatelliteCard
              key={item.id}
              item={item}
              onClick={setSelectedItem}
            />
          ))}
        </div>
      </div>

      {/* Detail Modal */}
      <DetailModal
        item={selectedItem}
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        onRefresh={handleRefreshItem}
      />
    </div>
  )
}
