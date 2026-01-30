const FILTER = "invert(1) hue-rotate(180deg) brightness(0.88) contrast(0.9)"

function applyFilter(enabled: boolean): void {
  const value = enabled ? FILTER : ""

  document.documentElement.style.filter = value
  document.body.style.filter = value

  document.querySelectorAll<HTMLElement>("embed, object").forEach((el) => {
    el.style.filter = value
  })
}

// Initial state on page load
browser.storage.local.get("filterEnabled").then(({ filterEnabled }) => {
  applyFilter(Boolean(filterEnabled))
})

// Listen for live toggle
browser.runtime.onMessage.addListener(
  (msg: { type: string; enabled: boolean }) => {
    if (msg.type === "SET_FILTER") {
      applyFilter(msg.enabled)
    }
  }
)

// Optional: Handle dynamic PDF re-renders (zoom, rotate, etc.)
const observer = new MutationObserver(() => {
  browser.storage.local.get("filterEnabled").then(({ filterEnabled }) => {
    applyFilter(Boolean(filterEnabled))
  })
})

observer.observe(document.body, {
  childList: true,
  subtree: true,
})
