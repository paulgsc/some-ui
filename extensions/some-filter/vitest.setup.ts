import { beforeEach, vi } from "vitest"

// Synchronous rAF so commitVisualState's double-rAF resolves in tests.
vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
  cb(0)
  return 0
})
vi.stubGlobal("cancelAnimationFrame", (): void => {})

// Stub the WebExtension browser global.
// prepaint.ts uses browser.runtime.getURL("prepaint.css") to locate the
// manifest-injected stylesheet. Tests inject a <style> element with the
// matching href via Object.defineProperty.
vi.stubGlobal("browser", {
  runtime: {
    getURL: (path: string): string =>
      `chrome-extension://testextensionid/${path}`,
  },
})

beforeEach(() => {
  document.documentElement.removeAttribute("data-sw-prepaint")
  document.documentElement.removeAttribute("data-sw-dark")
  document.documentElement.removeAttribute("style")
  document.body.removeAttribute("style")
  document.head.innerHTML = ""
  document.body.innerHTML = ""
})
