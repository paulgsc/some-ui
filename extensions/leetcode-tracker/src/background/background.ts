// Background script (MV2, lazy & lightweight)
const DB_API_URL = "http://localhost:3000/api"

interface StreakData {
  leetcode: number
  lastUpdated: string
}

// Default settings on install
browser.runtime.onInstalled.addListener(() => {
  browser.storage.local.set({ enabled: true })
})

// Handle messages from content
browser.runtime.onMessage.addListener((message, _sender) => {
  if (message.type === "UPDATE_STREAK") {
    return updateStreakInDB(message.platform, message.streak)
      .then((result) => ({ success: true, data: result }))
      .catch((err) => ({ success: false, error: err.message }))
  }

  if (message.type === "GET_STREAK") {
    return getStreakFromDB(message.platform)
      .then((result) => ({ success: true, data: result }))
      .catch((err) => ({ success: false, error: err.message }))
  }

  if (message.type === "GET_SETTINGS") {
    return browser.storage.local.get(["enabled"]).then((res) => ({
      enabled: res.enabled !== false,
    }))
  }
})

// Lazy refresh: only when a new tab is activated and it's LeetCode
browser.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await browser.tabs.get(tabId)
  if (tab.url?.includes("leetcode.com")) {
    browser.tabs.sendMessage(tabId, { type: "CHECK_TODAY" }).catch(() => {})
  }
})

// DB helpers
async function updateStreakInDB(
  platform: string,
  streak: number
): Promise<StreakData> {
  const resp = await fetch(`${DB_API_URL}/streak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      platform,
      streak,
      lastUpdated: new Date().toISOString(),
    }),
  })
  if (!resp.ok) throw new Error("Failed to update streak")
  return resp.json()
}

async function getStreakFromDB(platform: string): Promise<number> {
  const resp = await fetch(`${DB_API_URL}/streak/${platform}`)
  if (!resp.ok) throw new Error("Failed to fetch streak")
  const data = await resp.json()
  return data.streak ?? 0
}
