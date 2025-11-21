/**
 * Content Script Entry Point
 *
 * This is the main entry point for the browser extension content script.
 * It injects the streak overlay component into the page.
 */

import { createStreakOverlay } from "@streak/components/streak-overlay"

import "@streak/styles/content.css"

/**
 * Initialize the content script
 */
function init() {
  // Wait for DOM to be ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectOverlay)
  } else {
    injectOverlay()
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

// Initialize when script loads
init()
