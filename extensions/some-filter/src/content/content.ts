type FilterConfig = {
  invert?: number
  hueRotate?: number
  sepia?: number
  brightness?: number
  contrast?: number
}

const STYLE_ID = "__censor_filter"

function ensureStyle(): HTMLStyleElement {
  // 1. Cast the result of getElementById so it matches the return type
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (style) return style

  style = document.createElement("style")
  style.id = STYLE_ID
  const root = document.head || document.documentElement
  root.appendChild(style)

  return style
}

function buildFilter(config: FilterConfig): string {
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

function buildReciprocalFilter(config: FilterConfig): string {
  const parts: Array<string> = []

  // Invert and Hue-rotate are their own inverses at 1 and 180
  if (config.invert !== undefined) parts.push(`invert(${config.invert})`)
  if (config.hueRotate !== undefined)
    parts.push(`hue-rotate(${360 - config.hueRotate}deg)`)

  // For brightness and contrast, we need the mathematical inverse (1/x)
  // We use a small guard to avoid division by zero
  if (config.brightness !== undefined && config.brightness > 0) {
    parts.push(`brightness(${1 / config.brightness})`)
  }
  if (config.contrast !== undefined && config.contrast > 0) {
    parts.push(`contrast(${1 / config.contrast})`)
  }

  // Sepia doesn't have a simple CSS inverse; usually, inverting it back is enough
  if (config.sepia !== undefined) parts.push(`sepia(${config.sepia})`)

  return parts.join(" ")
}

function applyFilter(enabled: boolean, config: FilterConfig) {
  const style = ensureStyle()
  if (!enabled) {
    style.textContent = ""
    return
  }

  const mainFilter = buildFilter(config)
  const recoverFilter = buildReciprocalFilter(config)

  style.textContent = `
    :root {
      --sw-survival-filter: ${recoverFilter} !important;
    }
    html { 
      filter: ${mainFilter} !important; 
    }

    /* The Escape Class */
    .sw-no-filter {
      /* We must use 'both' if you want to neutralize the parent filter */
      filter: var(--sw-survival-filter) !important;
    }

    /* Target specific media but ALLOW .sw-no-filter to override them */
    video:not(.sw-no-filter), 
    canvas:not(.sw-no-filter), 
    embed:not(.sw-no-filter), 
    object:not(.sw-no-filter) { 
      filter: inherit !important; 
    }
  `
}

// Self-init: request current tab state from background
;(async () => {
  try {
    // safe baseline before response
    applyFilter(false, {})

    const response = (await browser.runtime.sendMessage({
      type: "GET_TAB_FILTER_STATE",
    })) as { enabled: boolean; config: FilterConfig } | undefined

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
