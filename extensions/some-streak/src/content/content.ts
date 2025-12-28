// content.ts
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
function init() {
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
function injectOverlay() {
  // Check if overlay already exists (prevent duplicates)
  if (document.querySelector(".streak-overlay")) {
    console.log("Streak overlay already exists")
    return
  }

  try {
    // Create and inject the overlay
    const overlay = createStreakOverlay()
    document.body.appendChild(overlay)
    console.log("Streak overlay injected successfully")
  } catch (error) {
    console.error("Failed to inject streak overlay:", error)
  }
}

/**
 * Initialize activity tracking for automatic task completion
 */
function initActivityTracking() {
  const config = getMatchingConfig()

  if (!config) {
    console.log("[Content] No activity tracking config for this page")
    return
  }

  try {
    activityTracker = createActivityTracker(config)
    activityTracker.init()
    console.log("[Content] Activity tracking initialized")
  } catch (error) {
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
