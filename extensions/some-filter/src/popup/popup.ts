
const api = typeof browser !== "undefined" ? browser : chrome

const DEFAULT_FILTERS = {
  invert: 1,
  hueRotate: 180,
  sepia: 0.12,
  brightness: 0.5,
  contrast: 0.92,
}

// DOM elements
const enableToggle = document.getElementById("enableToggle") as HTMLInputElement
const controls = document.getElementById("controls") as HTMLDivElement
const resetBtn = document.getElementById("reset") as HTMLButtonElement

const invertSlider = document.getElementById("invert") as HTMLInputElement
const hueRotateSlider = document.getElementById("hueRotate") as HTMLInputElement
const sepiaSlider = document.getElementById("sepia") as HTMLInputElement
const brightnessSlider = document.getElementById("brightness") as HTMLInputElement
const contrastSlider = document.getElementById("contrast") as HTMLInputElement

const invertValue = document.getElementById("invertValue") as HTMLSpanElement
const hueRotateValue = document.getElementById("hueRotateValue") as HTMLSpanElement
const sepiaValue = document.getElementById("sepiaValue") as HTMLSpanElement
const brightnessValue = document.getElementById("brightnessValue") as HTMLSpanElement
const contrastValue = document.getElementById("contrastValue") as HTMLSpanElement

// Load current state
async function loadState() {
  const data = await api.storage.local.get(["filterEnabled", "filterConfig"])
  
  const enabled = Boolean(data.filterEnabled)
  const config = data.filterConfig || DEFAULT_FILTERS
  
  enableToggle.checked = enabled
  controls.classList.toggle("disabled", !enabled)
  
  invertSlider.value = String(config.invert ?? DEFAULT_FILTERS.invert)
  hueRotateSlider.value = String(config.hueRotate ?? DEFAULT_FILTERS.hueRotate)
  sepiaSlider.value = String(config.sepia ?? DEFAULT_FILTERS.sepia)
  brightnessSlider.value = String(config.brightness ?? DEFAULT_FILTERS.brightness)
  contrastSlider.value = String(config.contrast ?? DEFAULT_FILTERS.contrast)
  
  updateValueDisplays()
}

// Update value displays
function updateValueDisplays() {
  invertValue.textContent = invertSlider.value
  hueRotateValue.textContent = `${hueRotateSlider.value}°`
  sepiaValue.textContent = sepiaSlider.value
  brightnessValue.textContent = brightnessSlider.value
  contrastValue.textContent = contrastSlider.value
}

// Get current config from sliders
function getCurrentConfig() {
  return {
    invert: parseFloat(invertSlider.value),
    hueRotate: parseFloat(hueRotateSlider.value),
    sepia: parseFloat(sepiaSlider.value),
    brightness: parseFloat(brightnessSlider.value),
    contrast: parseFloat(contrastSlider.value),
  }
}

// Save and apply state
async function saveAndApply(enabled: boolean, config: any) {
  await api.storage.local.set({
    filterEnabled: enabled,
    filterConfig: config,
  })
  
  // Send message to all tabs
  const tabs = await api.tabs.query({})
  for (const tab of tabs) {
    if (tab.id) {
      api.tabs.sendMessage(tab.id, {
        type: "TOGGLE_FILTER",
        enabled,
      }).catch(() => {
        // Ignore errors for tabs that don't have content script
      })
      
      if (enabled) {
        api.tabs.sendMessage(tab.id, {
          type: "UPDATE_FILTER",
          config,
        }).catch(() => {})
      }
    }
  }
}

// Toggle filter on/off
enableToggle.addEventListener("change", async () => {
  const enabled = enableToggle.checked
  const config = getCurrentConfig()
  
  controls.classList.toggle("disabled", !enabled)
  await saveAndApply(enabled, config)
})

// Update filter values in real-time
function setupSlider(slider: HTMLInputElement) {
  slider.addEventListener("input", () => {
    updateValueDisplays()
    
    if (enableToggle.checked) {
      const config = getCurrentConfig()
      saveAndApply(true, config)
    }
  })
}

setupSlider(invertSlider)
setupSlider(hueRotateSlider)
setupSlider(sepiaSlider)
setupSlider(brightnessSlider)
setupSlider(contrastSlider)

// Reset to defaults
resetBtn.addEventListener("click", async () => {
  invertSlider.value = String(DEFAULT_FILTERS.invert)
  hueRotateSlider.value = String(DEFAULT_FILTERS.hueRotate)
  sepiaSlider.value = String(DEFAULT_FILTERS.sepia)
  brightnessSlider.value = String(DEFAULT_FILTERS.brightness)
  contrastSlider.value = String(DEFAULT_FILTERS.contrast)
  
  updateValueDisplays()
  
  if (enableToggle.checked) {
    await saveAndApply(true, DEFAULT_FILTERS)
  } else {
    await api.storage.local.set({ filterConfig: DEFAULT_FILTERS })
  }
})

// Initialize
loadState()
export {} 
