import { useCallback, useState } from "react"

type FocusControls<T extends string> = {
  focusedRegion: T | null
  focusIntensity: number
  setFocus: (regionId: T | null, intensity: number) => void
  clearFocus: () => void
}

export function useFocusControls<T extends string>(): FocusControls<T> {
  const [focusedRegion, setFocusedRegion] = useState<T | null>(null)
  const [focusIntensity, setFocusIntensity] = useState(0)

  const setFocus = useCallback((regionId: T | null, intensity: number): void => {
    setFocusedRegion(regionId)
    setFocusIntensity(intensity)
  }, [])

  const clearFocus = useCallback((): void => {
    setFocusedRegion(null)
    setFocusIntensity(0)
  }, [])

  return {
    focusedRegion,
    focusIntensity,
    setFocus,
    clearFocus,
  }
}
