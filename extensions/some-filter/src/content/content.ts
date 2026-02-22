// Default filter configuration
const DEFAULT_FILTERS = {
  invert: 1,
  hueRotate: 180,
  sepia: 0.12,
  brightness: 0.5,
  contrast: 0.92,
}

type FilterConfig = {
  invert?: number
  hueRotate?: number
  sepia?: number
  brightness?: number
  contrast?: number
}

type StorageData = {
  filterEnabled: boolean
  filterConfig: FilterConfig
}

// Build filter string from config
function buildFilterString(config: FilterConfig): string {
  const parts: Array<string> = []

  if (config.invert !== undefined) parts.push(`invert(${config.invert})`)
  if (config.hueRotate !== undefined)
    parts.push(`hue-rotate(${config.hueRotate}deg)`)
  if (config.sepia !== undefined) parts.push(`sepia(${config.sepia})`)
  if (config.brightness !== undefined)
    parts.push(`brightness(${config.brightness})`)
  if (config.contrast !== undefined) parts.push(`contrast(${config.contrast})`)

  return parts.join(" ")
}

// Apply filter to the page
function applyFilter(enabled: boolean, config: FilterConfig): void {
  const value = enabled ? buildFilterString(config) : ""

  document.documentElement.style.setProperty("filter", value, "important")

  if (document.body) {
    document.body.style.setProperty("filter", value, "important")
  }

  // Handle embedded content
  document.querySelectorAll<HTMLElement>("embed, object").forEach((el) => {
    el.style.setProperty("filter", value, "important")
  })
}

// Get current state from storage
async function getCurrentState(): Promise<StorageData> {
  const api = typeof browser !== "undefined" ? browser : chrome
  const data = await api.storage.local.get(["filterEnabled", "filterConfig"])

  return {
    filterEnabled: Boolean(data.filterEnabled),
    filterConfig: data.filterConfig || DEFAULT_FILTERS,
  }
}

// Initialize on page load
;(async () => {
  const state = await getCurrentState()
  applyFilter(state.filterEnabled, state.filterConfig)
})()

// Listen for messages from popup
const api = typeof browser !== "undefined" ? browser : chrome

api.runtime.onMessage.addListener(
  (msg: { type: string; enabled?: boolean; config?: FilterConfig }) => {
    if (msg.type === "TOGGLE_FILTER") {
      getCurrentState().then((state) => {
        applyFilter(msg.enabled ?? state.filterEnabled, state.filterConfig)
      })
    } else if (msg.type === "UPDATE_FILTER") {
      getCurrentState().then((state) => {
        applyFilter(state.filterEnabled, msg.config || state.filterConfig)
      })
    } else if (msg.type === "GET_STATE") {
      // Respond with current state for popup
      return getCurrentState()
    }
  }
)

// Handle dynamic content changes (optional, for SPAs)
const observer = new MutationObserver(() => {
  getCurrentState().then((state) => {
    if (state.filterEnabled) {
      applyFilter(true, state.filterConfig)
    }
  })
})

if (document.body) {
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
}

export {} 
