// Standalone popup script. No shared imports with content.ts / background.ts.

import "./popup.css"

// ── DOM refs ──────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const toggleEl = document.getElementById("toggle-enabled") as HTMLInputElement
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const statusDot = document.getElementById("status-dot") as HTMLDivElement
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const statusText = document.getElementById("status-text") as HTMLSpanElement

// ── Helpers ───────────────────────────────────────────────────────────────────

function setStatus(active: boolean, label?: string): void {
  statusDot.classList.toggle("status-dot--active", active)
  statusText.textContent =
    label ?? (active ? "Overlay active" : "Overlay hidden")
}

/* eslint-disable no-restricted-globals */
function sendToContentScript(msg: object): Promise<unknown> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      if (!tab?.id) {
        resolve({ error: "No active tab" })
        return
      }
      chrome.tabs.sendMessage(tab.id, msg, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ error: chrome.runtime.lastError.message })
        } else {
          resolve(response)
        }
      })
    })
  })
}
/* eslint-enable no-restricted-globals */

// ── Init: query current state from content script ─────────────────────────────
async function init(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any
  const res = (await sendToContentScript({ type: "ytmo:get-state" })) as any

  if (res?.error) {
    // Not on a YouTube tab or content script not injected
    toggleEl.checked = false
    toggleEl.disabled = true
    setStatus(false, "Not on YouTube")
    return
  }

  toggleEl.checked = res?.enabled ?? true
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  setStatus(res?.enabled ?? true)
}

// ── Toggle handler ────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-misused-promises
toggleEl.addEventListener("change", async () => {
  const enabled = toggleEl.checked
  setStatus(false, "Updating…")
  /* eslint-disable @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any */
  const res = (await sendToContentScript({
    type: "ytmo:set-enabled",
    payload: enabled,
  })) as any
  /* eslint-enable @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any */

  if (res?.error) {
    setStatus(false, "Error — reload tab")
  } else {
    setStatus(enabled)
  }
})

// ── Run ───────────────────────────────────────────────────────────────────────
void init()
