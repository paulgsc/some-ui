

type FilterConfig = {
  invert?: number
  hueRotate?: number
  sepia?: number
  brightness?: number
  contrast?: number
}

const STYLE_ID = "__censor_filter"

function ensureStyle(): HTMLStyleElement {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (style) return style

  style = document.createElement("style")
  style.id = STYLE_ID
  const root = document.head || document.documentElement
  root.appendChild(style)

  return style
}

function buildFilter(config: FilterConfig): string {
  const parts: string[] = []
  if (config.invert !== undefined) parts.push(`invert(${config.invert})`)
  if (config.hueRotate !== undefined)
    parts.push(`hue-rotate(${config.hueRotate}deg)`)
  if (config.sepia !== undefined) parts.push(`sepia(${config.sepia})`)
  if (config.brightness !== undefined)
    parts.push(`brightness(${config.brightness})`)
  if (config.contrast !== undefined) parts.push(`contrast(${config.contrast})`)
  return parts.join(" ")
}

function applyFilter(enabled: boolean, config: FilterConfig) {
  const style = ensureStyle()

  if (!enabled) {
    style.textContent = ""
    return
  }

  style.textContent = `
    html { filter: ${buildFilter(config)} !important; }
    video, canvas, embed, object { filter: inherit !important; }
  `
}

// Self-init: request current tab state from background
;(async () => {
  try {
    // safe baseline before response
    applyFilter(false, {})

    const response = await browser.runtime.sendMessage({
      type: "GET_TAB_FILTER_STATE",
    }) as { enabled: boolean; config: FilterConfig } | undefined

    if (response) {
      applyFilter(response.enabled, response.config)
    }
  } catch {}
})()

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "TOGGLE_FILTER") {
    applyFilter(msg.enabled ?? false, msg.config ?? {})
  }
})

export {}
