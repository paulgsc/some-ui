import { useEffect, useState } from "react"
import { apiClient } from "@some-ui/fetch-kit"

type FetchState<T> = {
  data: T | null
  loading: boolean
  error: unknown | null
}

export function useFetch<T>(url: string): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    const controller = new AbortController()
    const fetchData = async (): Promise<void> => {
      try {
        const result = await apiClient.get<T>(url, {
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setState({
          data: result,
          loading: false,
          error: null,
        })
      } catch (err) {
        if (controller.signal.aborted) return
        setState({
          data: null,
          loading: false,
          error: err,
        })
      }
    }

    // Not awaited: an effect body cannot be async, and fetchData already
    // routes both outcomes into state.
    void fetchData()
    return () => controller.abort()
  }, [url])

  return state
}
