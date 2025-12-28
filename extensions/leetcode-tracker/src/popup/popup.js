// Popup script for controlling settings (Manifest V2 compatible)

const enableToggle = document.getElementById("enableToggle")
const leetcodeStreakEl = document.getElementById("leetcodeStreak")

// Load current settings and stats
async function loadSettings() {
  browser.storage.local.get(["enabled"]).then((result) => {
    enableToggle.checked = result.enabled !== false
  })
}

// Load current streak data
async function loadStreakData() {
  try {
    const response = await browser.runtime.sendMessage({
      type: "GET_STREAK",
      platform: "leetcode",
    })

    if (response.success) {
      const streak = response.data
      leetcodeStreakEl.textContent = `${streak} ${streak === 1 ? "day" : "days"}`
      leetcodeStreakEl.classList.remove("loading")
    } else {
      leetcodeStreakEl.textContent = "Error loading"
    }
  } catch (error) {
    leetcodeStreakEl.textContent = "0 days"
    leetcodeStreakEl.classList.remove("loading")
  }
}

// Handle toggle changes
enableToggle.addEventListener("change", (e) => {
  const enabled = e.target.checked

  browser.storage.local.set({ enabled }).then(() => {
    // Notify all tabs to update
    browser.tabs.query({}).then((tabs) => {
      tabs.forEach((tab) => {
        if (tab.url?.includes("leetcode.com") && tab.id) {
          browser.tabs
            .sendMessage(tab.id, {
              type: "TOGGLE_FEATURE",
              enabled,
            })
            .catch(() => {
              // Ignore errors for tabs that don't have content script
            })
        }
      })
    })
  })
})

// Initialize
loadSettings()
loadStreakData()
