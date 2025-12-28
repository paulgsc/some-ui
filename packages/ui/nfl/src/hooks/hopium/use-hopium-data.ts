import { useCallback, useEffect, useState } from "react"

import type {
  ApiAdapter,
  RefreshCallbacks,
  SatelliteDataItem,
} from "@/lib/types"

export function useSatelliteData<T>(
  adapter: ApiAdapter<T>,
  initialData: Array<SatelliteDataItem<T>> = [],
  autoRefreshInterval?: number
) {
  const [dataItems, setDataItems] =
    useState<Array<SatelliteDataItem<T>>>(initialData)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Auto-refresh functionality
  useEffect(() => {
    if (!autoRefreshInterval) return

    const interval = setInterval(() => {
      // Simulate data aging for demo purposes
      setDataItems((prev) =>
        prev.map((item) => ({
          ...item,
          freshness: Math.max(0, item.freshness - Math.random() * 2),
        }))
      )
    }, autoRefreshInterval)

    return () => clearInterval(interval)
  }, [autoRefreshInterval])

  const refreshAll = useCallback(
    async (callbacks?: RefreshCallbacks) => {
      setIsRefreshing(true)
      try {
        callbacks?.onStart?.("all")
        const newData = await adapter.refreshAll(callbacks)
        setDataItems(newData)
        setLastRefresh(new Date())
        callbacks?.onSuccess?.(newData[0]) // Pass first item as representative
      } catch (error) {
        callbacks?.onFailure?.(error as Error, "all")
      } finally {
        setIsRefreshing(false)
      }
    },
    [adapter]
  )

  const refreshItem = useCallback(
    async (id: string, callbacks?: RefreshCallbacks) => {
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
    ) => {
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
