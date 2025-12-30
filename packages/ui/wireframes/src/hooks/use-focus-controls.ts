import { useCallback, useState } from "react"

export function useFocusControls<T extends string>() {
  const [focusedRegion, setFocusedRegion] = useState<T | null>(null)
  const [focusIntensity, setFocusIntensity] = useState(0)

  const setFocus = useCallback((regionId: T | null, intensity: number) => {
    setFocusedRegion(regionId)
    setFocusIntensity(intensity)
  }, [])

  const clearFocus = useCallback(() => {
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
