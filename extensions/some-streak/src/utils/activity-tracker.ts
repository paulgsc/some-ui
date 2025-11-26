/**
 * Activity Tracker Module
 * Tracks user activity on specific domains/pages for automatic task completion
 */

export type ActivityConfig = {
  domain: string
  path?: string
  durationMs: number
  categoryId: string
  taskId: string
}

type ActivitySession = {
  startTime: number
  lastActivityTime: number
  isActive: boolean
}

/**
 * Creates an activity tracker for a specific configuration
 */
export function createActivityTracker(config: ActivityConfig) {
  let session: ActivitySession | null = null
  let checkInterval: number | null = null

  /**
   * Check if current page matches the config
   */
  const matchesConfig = (): boolean => {
    const currentDomain = window.location.hostname
    const currentPath = window.location.pathname

    if (!currentDomain.includes(config.domain)) {
      return false
    }

    if (config.path && !currentPath.includes(config.path)) {
      return false
    }

    return true
  }

  /**
   * Start tracking session
   */
  const startSession = (): void => {
    if (session?.isActive) return

    const now = Date.now()
    session = {
      startTime: now,
      lastActivityTime: now,
      isActive: true,
    }

    console.log(`[ActivityTracker] Session started for ${config.categoryId}`)
    startChecking()
  }

  /**
   * Update last activity time (called on user interaction)
   */
  const updateActivity = (): void => {
    if (session?.isActive) {
      session.lastActivityTime = Date.now()
    }
  }

  /**
   * Stop tracking session
   */
  const stopSession = (): void => {
    if (!session) return

    session.isActive = false
    stopChecking()

    console.log(`[ActivityTracker] Session stopped for ${config.categoryId}`)
  }

  /**
   * Check if duration requirement is met
   */
  const checkDuration = async (): Promise<void> => {
    if (!session?.isActive) return

    const elapsed = Date.now() - session.startTime

    if (elapsed >= config.durationMs) {
      console.log(
        `[ActivityTracker] Duration requirement met for ${config.categoryId}`
      )

      // Notify background to complete the task
      try {
        const response = await browser.runtime.sendMessage({
          type: "AUTO_COMPLETE_TASK",
          categoryId: config.categoryId,
          taskId: config.taskId,
        })

        if (response.success) {
          console.log(
            `[ActivityTracker] Task completed successfully, stopping all tracking`
          )
          stopSession()
          cleanup()
        }
      } catch (error) {
        console.error("[ActivityTracker] Error completing task:", error)
      }
    }
  }

  /**
   * Check if task is already completed (query background state)
   */
  const checkTaskCompletion = async (): Promise<boolean> => {
    try {
      const response = await browser.runtime.sendMessage({
        type: "CHECK_TASK_STATUS",
        categoryId: config.categoryId,
        taskId: config.taskId,
      })

      return response.success && response.isCompleted
    } catch (error) {
      console.error("[ActivityTracker] Error checking task status:", error)
      return false
    }
  }

  /**
   * Start periodic checking
   */
  const startChecking = (): void => {
    if (checkInterval) return

    // Check every 30 seconds
    checkInterval = window.setInterval(() => {
      checkDuration()
    }, 30000)

    // Also check immediately
    checkDuration()
  }

  /**
   * Stop periodic checking
   */
  const stopChecking = (): void => {
    if (checkInterval) {
      clearInterval(checkInterval)
      checkInterval = null
    }
  }

  /**
   * Initialize tracker
   */
  const init = async (): Promise<void> => {
    if (!matchesConfig()) {
      console.log(
        `[ActivityTracker] Page does not match config for ${config.categoryId}`
      )
      return
    }

    // Check if task is already completed before starting
    const isCompleted = await checkTaskCompletion()
    if (isCompleted) {
      console.log(
        `[ActivityTracker] Task already completed for ${config.categoryId}, skipping tracking`
      )
      return
    }

    console.log(`[ActivityTracker] Initialized for ${config.categoryId}`)

    // Start session on page load
    startSession()

    // Track user activity (keyboard, mouse)
    const activityEvents = ["keydown", "mousedown", "mousemove", "scroll"]

    activityEvents.forEach((event) => {
      document.addEventListener(event, updateActivity, { passive: true })
    })

    // Stop session on page unload
    window.addEventListener("beforeunload", stopSession)

    // Handle visibility changes (tab switching)
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        // User switched tabs - pause tracking
        stopChecking()
      } else if (session?.isActive) {
        // User returned - resume tracking
        startChecking()
      }
    })
  }

  /**
   * Cleanup tracker
   */
  const cleanup = (): void => {
    stopSession()

    const activityEvents = ["keydown", "mousedown", "mousemove", "scroll"]
    activityEvents.forEach((event) => {
      document.removeEventListener(event, updateActivity)
    })
  }

  /**
   * Get current session info (for debugging)
   */
  const getSessionInfo = (): ActivitySession | null => {
    return session
  }

  return {
    init,
    cleanup,
    getSessionInfo,
  }
}
