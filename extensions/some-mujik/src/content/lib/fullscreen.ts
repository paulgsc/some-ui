// ─── Fullscreen Watcher ───────────────────────────────────────────────────────
// Calls onEnter / onExit when fullscreen state changes.
// Also handles YouTube's custom fullscreen (theater mode via class mutation).

export type FullscreenWatcherHandle = {
  destroy(): void
}

export function watchFullscreen(
  onEnter: () => void,
  onExit: () => void
): FullscreenWatcherHandle {
  let fullscreen = false

  function checkAndNotify() {
    const isFs =
      !!document.fullscreenElement ||
      !!(document as any).webkitFullscreenElement ||
      document.documentElement.classList.contains("ytp-fullscreen") ||
      !!document.querySelector(".ytp-fullscreen")

    if (isFs && !fullscreen) {
      fullscreen = true
      onEnter()
    } else if (!isFs && fullscreen) {
      fullscreen = false
      onExit()
    }
  }

  // Standard fullscreen API
  document.addEventListener("fullscreenchange", checkAndNotify)
  document.addEventListener("webkitfullscreenchange", checkAndNotify)

  // YT uses class mutations on the player for its own fullscreen toggle
  const observer = new MutationObserver(checkAndNotify)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
    subtree: true,
  })

  // Also observe the YT player element if present
  const player = document.getElementById("movie_player")
  if (player) {
    observer.observe(player, { attributes: true, attributeFilter: ["class"] })
  }

  return {
    destroy() {
      document.removeEventListener("fullscreenchange", checkAndNotify)
      document.removeEventListener("webkitfullscreenchange", checkAndNotify)
      observer.disconnect()
    },
  }
}
