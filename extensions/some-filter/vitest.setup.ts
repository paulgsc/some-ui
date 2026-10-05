import { beforeEach, vi } from "vitest"

// Synchronous rAF so commitVisualState's double-rAF resolves in tests.
vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
  cb(0)
  return 0
})
vi.stubGlobal("cancelAnimationFrame", (): void => {})

// Stub the WebExtension `browser` global that api.firefox.ts reads.
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
