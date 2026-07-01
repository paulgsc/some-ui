import type { Dispatch, SetStateAction } from "react"
import { useEffect, useState } from "react"

/**
 * Options for the usePeriodicOverlay hook
 */
type UsePeriodicOverlayOptions = {
  /** Initial state of the overlay */
  initialState?: boolean
  /** How long to show the overlay in ms */
  showDuration?: number
  /** How often to show the overlay in ms */
  showInterval?: number
  /** Whether to auto-hide when not hovering */
  autoHide?: boolean
}

/**
 * Hook that manages periodic showing/hiding of an overlay
 */
export function usePeriodicOverlay({
  initialState = true,
  showDuration = 8000,
  showInterval = 30000,
  autoHide = true,
}: UsePeriodicOverlayOptions = {}): {
  showOverlay: boolean
  setShowOverlay: Dispatch<SetStateAction<boolean>>
  isHovering: boolean
  mouseHandlers: {
    onMouseEnter: () => void
    onMouseLeave: () => void
  }
} {
  const [showOverlay, setShowOverlay] = useState(initialState)
  const [isHovering, setIsHovering] = useState(false)

  // Initial show and periodic show
  useEffect(() => {
    // Show overlay periodically
    const overlayInterval = setInterval(() => {
      setShowOverlay(true)
      if (autoHide) {
        setTimeout(() => {
          if (!isHovering) setShowOverlay(false)
        }, showDuration)
      }
    }, showInterval)

    // Initial overlay
    setShowOverlay(true)
    if (autoHide) {
      setTimeout(() => {
        if (!isHovering) setShowOverlay(false)
      }, showDuration)
    }

    return (): void => clearInterval(overlayInterval)
  }, [isHovering, autoHide, showDuration, showInterval])

  const mouseHandlers = {
    onMouseEnter: (): void => setIsHovering(true),
    onMouseLeave: (): void => setIsHovering(false),
  }

  return {
    showOverlay,
    setShowOverlay,
    isHovering,
    mouseHandlers,
  }
}
