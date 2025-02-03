import { useEffect, useState } from "react"

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
    const fetchData = async (): Promise<void> => {
      try {
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        const result = await response.json()
        setState({
          data: result,
          loading: false,
          error: null,
        })
      } catch (err) {
        setState({
          data: null,
          loading: false,
          error: err,
        })
      }
    }

    fetchData()
  }, [url])

  return state
}
