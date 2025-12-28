import { initializeTaskNotifications } from "@some-cycle/content"

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeTaskNotifications)
} else {
  initializeTaskNotifications()
}
