

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
  filteredTabIds: number[]
}

function buildFilterString(config: FilterConfig): string {
  const parts: string[] = []
  if (config.invert !== undefined) parts.push(`invert(${config.invert})`)
  if (config.hueRotate !== undefined) parts.push(`hue-rotate(${config.hueRotate}deg)`)
  if (config.sepia !== undefined) parts.push(`sepia(${config.sepia})`)
  if (config.brightness !== undefined) parts.push(`brightness(${config.brightness})`)
  if (config.contrast !== undefined) parts.push(`contrast(${config.contrast})`)
  return parts.join(" ")
}

// Side effect: sets filter CSS on documentElement, body, embed/object
function applyFilter(enabled: boolean, config: FilterConfig): void {
  const value = enabled ? buildFilterString(config) : ""
  document.documentElement.style.setProperty("filter", value, "important")
  if (document.body) {
    document.body.style.setProperty("filter", value, "important")
  }
  document.querySelectorAll<HTMLElement>("embed, object").forEach((el) => {
    el.style.setProperty("filter", value, "important")
  })
}

const api = typeof browser !== "undefined" ? browser : chrome

// Precondition: api.storage.local contains filteredTabIds: number[]
async function getCurrentState(): Promise<StorageData> {
  const data = await api.storage.local.get(["filterEnabled", "filterConfig", "filteredTabIds"])
  return {
    filterEnabled: Boolean(data.filterEnabled),
    filterConfig: data.filterConfig ?? DEFAULT_FILTERS,
    filteredTabIds: data.filteredTabIds ?? [],
  }
}

// Note: tab id is not available in content scripts; filter state derived from TOGGLE_FILTER messages only
;(async () => {
  const state = await getCurrentState()
  // filterEnabled is legacy global flag; per-tab state is set via message
  applyFilter(state.filterEnabled, state.filterConfig)
})()

api.runtime.onMessage.addListener(
  (msg: { type: string; enabled?: boolean; config?: FilterConfig }) => {
    if (msg.type === "TOGGLE_FILTER") {
      getCurrentState().then((state) => {
        applyFilter(msg.enabled ?? state.filterEnabled, msg.config ?? state.filterConfig)
      })
    } else if (msg.type === "UPDATE_FILTER") {
      getCurrentState().then((state) => {
        applyFilter(state.filterEnabled, msg.config ?? state.filterConfig)
      })
    }
  }
)

const observer = new MutationObserver(() => {
  getCurrentState().then((state) => {
    if (state.filterEnabled) {
      applyFilter(true, state.filterConfig)
    }
  })
})

if (document.body) {
  observer.observe(document.body, { childList: true, subtree: true })
}

export {}
