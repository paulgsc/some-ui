/**
 * Content Script Entry Point
 *
 * This is the main entry point for the browser extension content script.
 * It injects the streak overlay component into the page and initializes
 * activity tracking for automatic task completion.
 */
import { createStreakOverlay } from "@streak/components/streak-overlay"
import { getMatchingConfig } from "@streak/utils/activity-configs"
import { createActivityTracker } from "@streak/utils/activity-tracker"

import "@streak/styles/content.css"

let activityTracker: ReturnType<typeof createActivityTracker> | null = null

/**
 * Initialize the content script
 */
function init(): void {
  // Wait for DOM to be ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      injectOverlay()
      initActivityTracking()
    })
  } else {
    injectOverlay()
    initActivityTracking()
  }
}

/**
 * Inject the streak overlay into the page
 */
function injectOverlay(): void {
  // Check if overlay already exists (prevent duplicates)
  if (document.querySelector(".streak-overlay")) {
    return
  }

  try {
    // Create and inject the overlay
    const overlay = createStreakOverlay()
    document.body.appendChild(overlay)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to inject streak overlay:", error)
  }
}

/**
 * Initialize activity tracking for automatic task completion
 */
function initActivityTracking(): void {
  const config = getMatchingConfig()

  if (!config) {
    return
  }

  try {
    activityTracker = createActivityTracker(config)
    activityTracker.init()
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[Content] Failed to initialize activity tracking:", error)
  }
}

/**
 * Cleanup on page unload
 */
window.addEventListener("beforeunload", () => {
  if (activityTracker) {
    activityTracker.cleanup()
  }
})

// Initialize when script loads
init()
