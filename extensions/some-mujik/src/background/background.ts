
// ─── background.ts ────────────────────────────────────────────────────────────
// Minimal background script.
// Relays messages between popup and content script.
// No shared imports with content.ts or popup.ts.

// ── Forward popup toggle → active YT tab content script ───────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Messages from popup targeting content
  if (msg.type === "ytmo:set-enabled" || msg.type === "ytmo:get-state") {
    // Find the active YouTube tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      if (!tab?.id) {
        sendResponse({ error: "No active tab" })
        return
      }

      chrome.tabs.sendMessage(tab.id, msg, (response) => {
        if (chrome.runtime.lastError) {
          // Content script not yet injected on this tab
          sendResponse({ error: chrome.runtime.lastError.message })
        } else {
          sendResponse(response)
        }
      })
    })

    // Return true to keep message channel open for async response
    return true
  }
})

// ── Extension icon click: open popup (already wired via browser_action) ───────
// No additional logic needed for MV2 popup.
export {}
