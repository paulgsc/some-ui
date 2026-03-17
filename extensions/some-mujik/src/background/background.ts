// ─── background.ts ────────────────────────────────────────────────────────────
// Minimal background script using Promise-based browser API.

// If you are using a polyfill for Chrome support, you'd import it here:
// import browser from "webextension-polyfill"

/**
 * We use an async function for the listener.
 * Note: In MV2/MV3, the listener itself shouldn't be async if you want to
 * return a boolean, but using the browser namespace handles promises natively.
 */
browser.runtime.onMessage.addListener(async (msg) => {
  // Messages from popup targeting content
  if (msg.type === "ytmo:set-enabled" || msg.type === "ytmo:get-state") {
    try {
      // Find the active YouTube tab
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      })
      const tab = tabs[0]

      if (!tab?.id) {
        return { error: "No active tab" }
      }

      // Send message and await the response from content script
      const response = await browser.tabs.sendMessage(tab.id, msg)
      return response
    } catch (error: any) {
      // Content script might not be injected or tab closed
      return { error: error.message || "Failed to relay message" }
    }
  }

  // Return undefined for unhandled messages
  return undefined
})

export {}
