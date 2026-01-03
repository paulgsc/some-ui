const dramaIdInput = document.getElementById("dramaId") as HTMLInputElement
const episodeInput = document.getElementById(
  "episodeNumber"
) as HTMLInputElement
const markBtn = document.getElementById("markBtn") as HTMLButtonElement
const unmarkBtn = document.getElementById("unmarkBtn") as HTMLButtonElement
const statusDiv = document.getElementById("status") as HTMLDivElement
const trackedInfoDiv = document.getElementById("trackedInfo") as HTMLDivElement
const trackedDramaP = document.getElementById(
  "trackedDrama"
) as HTMLParagraphElement
const trackedEpisodeP = document.getElementById(
  "trackedEpisode"
) as HTMLParagraphElement

let currentTabId: number | null = null

// Load saved data and current tab info
async function init() {
  // Get current tab
  const tabs = await browser.tabs.query({ active: true, currentWindow: true })
  if (tabs[0]?.id) {
    currentTabId = tabs[0].id

    // Check if this tab is already tracked
    const response = await browser.runtime.sendMessage({
      type: "GET_TRACKED_TABS",
    })
    const trackedTab = response.tabs.find((t: any) => t.tabId === currentTabId)

    if (trackedTab) {
      dramaIdInput.value = trackedTab.dramaId
      episodeInput.value = trackedTab.episodeNumber.toString()
      showTrackedInfo(trackedTab.dramaId, trackedTab.episodeNumber)
    }
  }

  // Load last used values from storage
  const stored = await browser.storage.local.get(["lastDramaId", "lastEpisode"])
  if (!dramaIdInput.value && stored.lastDramaId) {
    dramaIdInput.value = stored.lastDramaId
  }
  if (!episodeInput.value && stored.lastEpisode) {
    episodeInput.value = stored.lastEpisode
  }
}

markBtn.addEventListener("click", async () => {
  const dramaId = dramaIdInput.value.trim()
  const episodeNumber = parseInt(episodeInput.value)

  if (!dramaId) {
    showStatus("Please enter a drama ID", "error")
    return
  }

  if (!episodeNumber || episodeNumber < 1) {
    showStatus("Please enter a valid episode number", "error")
    return
  }

  if (!currentTabId) {
    showStatus("Could not identify current tab", "error")
    return
  }

  // Check if tab is YouTube
  const tabs = await browser.tabs.query({ active: true, currentWindow: true })
  const url = tabs[0]?.url || ""

  if (!url.includes("youtube.com/watch")) {
    showStatus("Please navigate to a YouTube video first", "error")
    return
  }

  // Send message to background to mark tab
  try {
    await browser.runtime.sendMessage({
      type: "MARK_AS_CDRAMA",
      data: {
        tabId: currentTabId,
        dramaId,
        episodeNumber,
      },
    })

    // Save to storage for next time
    await browser.storage.local.set({
      lastDramaId: dramaId,
      lastEpisode: episodeNumber.toString(),
    })

    showStatus("✓ Tab marked! Now tracking your watch session", "success")
    showTrackedInfo(dramaId, episodeNumber)
  } catch (error) {
    showStatus("Failed to mark tab: " + error, "error")
  }
})

unmarkBtn.addEventListener("click", async () => {
  if (!currentTabId) {
    showStatus("Could not identify current tab", "error")
    return
  }

  try {
    await browser.runtime.sendMessage({
      type: "UNMARK_CDRAMA",
      data: { tabId: currentTabId },
    })

    showStatus("Tracking stopped", "info")
    hideTrackedInfo()
  } catch (error) {
    showStatus("Failed to stop tracking: " + error, "error")
  }
})

function showStatus(message: string, type: "success" | "error" | "info") {
  statusDiv.textContent = message
  statusDiv.className = `status ${type}`
  statusDiv.style.display = "block"

  setTimeout(() => {
    statusDiv.style.display = "none"
  }, 3000)
}

function showTrackedInfo(dramaId: string, episodeNumber: number) {
  trackedDramaP.textContent = `Drama: ${dramaId}`
  trackedEpisodeP.textContent = `Episode: ${episodeNumber}`
  trackedInfoDiv.style.display = "block"
}

function hideTrackedInfo() {
  trackedInfoDiv.style.display = "none"
}

// Auto-increment episode number with keyboard shortcut
episodeInput.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp") {
    e.preventDefault()
    episodeInput.value = (parseInt(episodeInput.value || "0") + 1).toString()
  } else if (e.key === "ArrowDown") {
    e.preventDefault()
    const val = parseInt(episodeInput.value || "0")
    episodeInput.value = Math.max(1, val - 1).toString()
  }
})

init()
