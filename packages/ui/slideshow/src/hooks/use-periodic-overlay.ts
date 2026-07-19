import type { Dispatch, SetStateAction } from "react"
import { useEffect, useMemo, useRef, useState } from "react"

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

  // Track operational variables dynamically without forcing interval recreation loops
  const stateRef = useRef({ isHovering, autoHide, showDuration })
  useEffect(() => {
    stateRef.current = { isHovering, autoHide, showDuration }
  }, [isHovering, autoHide, showDuration])

  // Manage all micro-tasks and timers explicitly inside the synchronization layer
  useEffect(() => {
    let hideTimeoutId: ReturnType<typeof setTimeout> | null = null

    const triggerHideTimer = (): void => {
      if (!stateRef.current.autoHide) {
        return
      }

      if (hideTimeoutId !== null) {
        clearTimeout(hideTimeoutId)
      }

      hideTimeoutId = setTimeout(() => {
        if (!stateRef.current.isHovering) {
          setShowOverlay(false)
        }
      }, stateRef.current.showDuration)
    }

    // Schedule the initial hiding timeline cleanly post-mount
    triggerHideTimer()

    // Setup periodic synchronization with the browser timer system
    const overlayInterval = setInterval(() => {
      setShowOverlay(true)
      triggerHideTimer()
    }, showInterval)

    return (): void => {
      clearInterval(overlayInterval)
      if (hideTimeoutId !== null) {
        clearTimeout(hideTimeoutId)
      }
    }
  }, [showInterval])

  // Stabilize structural identity to eliminate downstream render thrashing
  const mouseHandlers = useMemo(
    () => ({
      onMouseEnter: (): void => setIsHovering(true),
      onMouseLeave: (): void => setIsHovering(false),
    }),
    []
  )

  return {
    showOverlay,
    setShowOverlay,
    isHovering,
    mouseHandlers,
  }
}
