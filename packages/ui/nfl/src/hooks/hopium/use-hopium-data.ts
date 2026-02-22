import { useCallback, useEffect, useState } from "react"
import type {
  ApiAdapter,
  RefreshCallbacks,
  SatelliteDataItem,
} from "@nfl/types/hopium/hopium-tracker"

// Defined a return type for the hook to satisfy the linter
export type UseSatelliteDataReturn<T> = {
  dataItems: Array<SatelliteDataItem<T>>
  lastRefresh: Date
  isRefreshing: boolean
  refreshAll: (callbacks?: RefreshCallbacks) => Promise<void>
  refreshItem: (id: string, callbacks?: RefreshCallbacks) => Promise<void>
  updateItems: (
    updater: (items: Array<SatelliteDataItem<T>>) => Array<SatelliteDataItem<T>>
  ) => void
}

export function useSatelliteData<T>(
  adapter: ApiAdapter<T>,
  initialData: Array<SatelliteDataItem<T>> = [],
  autoRefreshInterval?: number
): UseSatelliteDataReturn<T> {
  const [dataItems, setDataItems] =
    useState<Array<SatelliteDataItem<T>>>(initialData)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    if (!autoRefreshInterval) return

    const interval = setInterval(() => {
      setDataItems((prev) =>
        prev.map((item) => ({
          ...item,
          freshness: Math.max(0, item.freshness - Math.random() * 2),
        }))
      )
    }, autoRefreshInterval)

    return (): void => clearInterval(interval)
  }, [autoRefreshInterval])

  const refreshAll = useCallback(
    async (callbacks?: RefreshCallbacks): Promise<void> => {
      setIsRefreshing(true)
      try {
        callbacks?.onStart?.("all")
        const newData = await adapter.refreshAll(callbacks)
        setDataItems(newData)
        setLastRefresh(new Date())

        if (newData[0]) {
          callbacks?.onSuccess?.(newData[0])
        }
      } catch (error) {
        callbacks?.onFailure?.(error as Error, "all")
      } finally {
        setIsRefreshing(false)
      }
    },
    [adapter]
  )

  const refreshItem = useCallback(
    async (id: string, callbacks?: RefreshCallbacks): Promise<void> => {
      try {
        callbacks?.onStart?.(id)
        const updatedItem = await adapter.refreshItem(id, callbacks)
        setDataItems((prev) =>
          prev.map((item) => (item.id === id ? updatedItem : item))
        )
        callbacks?.onSuccess?.(updatedItem)
      } catch (error) {
        callbacks?.onFailure?.(error as Error, id)
      }
    },
    [adapter]
  )

  const updateItems = useCallback(
    (
      updater: (
        items: Array<SatelliteDataItem<T>>
      ) => Array<SatelliteDataItem<T>>
    ): void => {
      setDataItems(updater)
    },
    []
  )

  return {
    dataItems,
    lastRefresh,
    isRefreshing,
    refreshAll,
    refreshItem,
    updateItems,
  }
}
