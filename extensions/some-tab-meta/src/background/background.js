// Background script handles HTTP requests (bypasses CORS/mixed-content restrictions)

chrome.runtime.onInstalled.addListener(() => {
  // eslint-disable-next-line no-console
  console.log("YouTube Now Playing Tracker installed")
})

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "now-playing") {
    // Make the HTTP request from background script (has elevated privileges)
    fetch("http://nixos.local:3000/now-playing", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message.payload),
    })
      .then((response) => {
        if (!response.ok) {
          // eslint-disable-next-line no-console
          console.log("Server responded with error:", response.status)
        }
        return response.text()
      })
      .then((data) => {
        // eslint-disable-next-line no-console
        console.log("Successfully sent to server:", message.payload.title)
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error("Background fetch error:", error)
      })
  }

  // Return true to keep message channel open for async response
  return true
})
