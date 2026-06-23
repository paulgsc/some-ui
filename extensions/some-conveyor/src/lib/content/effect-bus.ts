import { ext } from "@conveyor/platform/content"
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
 * Note on ext.scripting.executeScript:
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
      // eslint-disable-next-line no-console
      console.error("[EffectBus] Action failed:", action.type, err)
    }
  }

  private async execute(action: FaceAction): Promise<void> {
    switch (action.type) {
      case "Noop":
        return

      case "OpenTab":
        await ext.tabs.create({ url: action.url })
        return

      case "FocusTab": {
        const tabs = await ext.tabs.query({ url: action.url })
        if (tabs.length > 0 && tabs[0]!.id != null) {
          await ext.tabs.update(tabs[0]!.id, { active: true })
          if (tabs[0]!.windowId != null) {
            await ext.windows.update(tabs[0]!.windowId, { focused: true })
          }
        } else {
          await ext.tabs.create({ url: action.url })
        }
        return
      }

      case "TogglePlayback": {
        const tabs =
          action.tabId != null
            ? [{ id: action.tabId }]
            : await ext.tabs.query({ active: true, currentWindow: true })

        const tabId = tabs[0]?.id
        if (tabId == null) return

        // Inject a small script into the target tab to toggle media playback.
        // Requires "scripting" permission (MV3) — declared in manifest.
        await ext.scripting.executeScript({
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
        {
          // ext.action.openPopup() is MV3 Firefox 109+ / Chrome 99+; not in the
          // webextension-polyfill types yet so we widen through unknown first.
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
          const actionApi = ext.action as unknown as {
            openPopup?: () => Promise<void>
          }
          await actionApi.openPopup?.()
        }
        return

      case "SendMessage":
        await ext.runtime.sendMessage(action.payload)
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
