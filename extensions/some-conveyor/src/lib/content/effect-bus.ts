import type { Disposable, FaceAction } from "@conveyor/types"

/**
 * EffectBus
 *
 * Receives FaceAction events from CubeInstances and executes the corresponding
 * browser-level side effects. Cubes never know how actions are implemented.
 *
 * Two categories (per the design spec):
 *
 *   a. Browser behavior  — tab nav, play/pause, popup/messaging
 *   b. Fetch side effects — localhost service calls
 *
 * Note on browser.scripting.executeScript:
 *   Requires Firefox 102+ and the "scripting" permission.
 *   Used for TogglePlayback — injecting play/pause into the active tab's
 *   media context. This is the only reliable cross-origin media control
 *   mechanism available to MV3 content scripts.
 *
 * Note on LocalhostFetch:
 *   Requires a CSP-permissive host or a native messaging bridge for strict
 *   pages. For v1, we use fetch() directly to localhost from the content
 *   script (works on most pages). Background-script routing can be added
 *   if content script fetch is blocked.
 */
export class EffectBus implements Disposable {
  private disposed = false

  async dispatch(action: FaceAction): Promise<void> {
    if (this.disposed) return

    try {
      await this.execute(action)
    } catch (err) {
      console.error("[EffectBus] Action failed:", action.type, err)
    }
  }

  private async execute(action: FaceAction): Promise<void> {
    switch (action.type) {
      case "Noop":
        return

      case "OpenTab":
        await browser.tabs.create({ url: action.url })
        return

      case "FocusTab": {
        const tabs = await browser.tabs.query({ url: action.url })
        if (tabs.length > 0 && tabs[0]!.id != null) {
          await browser.tabs.update(tabs[0]!.id, { active: true })
          if (tabs[0]!.windowId != null) {
            await browser.windows.update(tabs[0]!.windowId, { focused: true })
          }
        } else {
          await browser.tabs.create({ url: action.url })
        }
        return
      }

      case "TogglePlayback": {
        const tabs =
          action.tabId != null
            ? [{ id: action.tabId }]
            : await browser.tabs.query({ active: true, currentWindow: true })

        const tabId = tabs[0]?.id
        if (tabId == null) return

        // Inject a small script into the target tab to toggle media playback.
        // Requires "scripting" permission (MV3) — declared in manifest.
        await browser.scripting.executeScript({
          target: { tabId },
          func: () => {
            const videos = document.querySelectorAll<HTMLVideoElement>("video")
            const audios = document.querySelectorAll<HTMLAudioElement>("audio")
            const media = [...videos, ...audios]
            const hasPlaying = media.some((m) => !m.paused)
            for (const m of media) {
              if (hasPlaying) m.pause()
              else m.play().catch(() => void 0)
            }
          },
        })
        return
      }

      case "ShowPopup":
        // Opens the extension action popup programmatically.
        // browser.action.openPopup() is MV3 Firefox 109+.
        await (browser.action as any).openPopup?.()
        return

      case "SendMessage":
        await browser.runtime.sendMessage(action.payload)
        return

      case "LocalhostFetch": {
        const method = action.method ?? "POST"
        const url = `http://localhost${action.path}`
        const opts: RequestInit = {
          method,
          headers: { "Content-Type": "application/json" },
        }
        if (action.body != null && method !== "GET") {
          opts.body = JSON.stringify(action.body)
        }
        const response = await fetch(url, opts)
        if (!response.ok) {
          throw new Error(`LocalhostFetch ${url} → HTTP ${response.status}`)
        }
        return
      }

      default:
        action satisfies never
    }
  }

  dispose(): void {
    this.disposed = true
  }
}
