/**
 * content.ts — TabLedger HUD entry point
 *
 * Responsibilities:
 *   1. Guard against non-http pages (extension, about:, etc.)
 *   2. Inject CSS once
 *   3. Mount the FloatingHUD
 *   4. Mount the Toast
 *   5. Start the polling loop and wire data → UI
 *
 * All UI logic lives in ./ui/*
 * All browser/business logic lives in ./logic.ts
 */

import rawCSS from "@tab/styles/content.css?inline"
import { FloatingHUD } from "@tab/ui/floating-hud"
import { Toast } from "@tab/ui/toast"

import { deriveTags, injectStyles, startPolling } from "./logic"

// ─── Guards ───────────────────────────────────────────────────────────────────

const BLOCKED_PROTOCOLS = new Set([
  "chrome-extension:",
  "moz-extension:",
  "about:",
  "chrome:",
])

function shouldInject(): boolean {
  return !BLOCKED_PROTOCOLS.has(location.protocol)
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init(): void {
  if (!shouldInject()) return

  // 1. Styles
  injectStyles(rawCSS)

  // 2. HUD
  const hud = new FloatingHUD()
  hud.mount(document.body)

  // 3. Toast
  const toast = new Toast()
  toast.mount(document.body)

  // 4. Polling — wire logic → UI
  startPolling(
    (result) => {
      const { record, elapsed, sessionElapsed, neglect, isFirstPoll } = result

      if (isFirstPoll) {
        hud.flashSession(sessionElapsed)
      }

      // Derive tags from record state (pass 0 for sessionTotal when unavailable)
      const tags = deriveTags(record, elapsed, sessionElapsed, sessionElapsed)

      hud.update({ record, elapsed, sessionElapsed, neglect, tags })
    },
    (text, color) => {
      toast.show(text, color)
    }
  )
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

if (document.documentElement) {
  init()
} else {
  document.addEventListener("DOMContentLoaded", init)
}

export {}
