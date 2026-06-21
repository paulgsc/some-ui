import { vi } from "vitest"

/**
 * Stub the `browser` global for jsdom.
 *
 * The WebExtensions runtime is not available in jsdom. Unit tests that exercise
 * code paths using `browser.*` must either stub the specific method they need or
 * rely on this baseline stub.
 *
 * The stub is intentionally shallow — only the surface used by the conveyor
 * content and background scripts is included. Deep stubs for individual tests
 * should use vi.mocked() on the relevant sub-object.
 */
const browserStub = {
  runtime: {
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    sendMessage: vi.fn(),
    getURL: vi.fn(
      (path: string): string => `chrome-extension://test-id/${path}`
    ),
  },
  tabs: {
    get: vi.fn(),
    sendMessage: vi.fn(),
    onActivated: { addListener: vi.fn() },
    onUpdated: { addListener: vi.fn() },
  },
  storage: {
    local: { get: vi.fn(), set: vi.fn() },
    sync: { get: vi.fn(), set: vi.fn() },
  },
}

Object.defineProperty(globalThis, "browser", {
  value: browserStub,
  writable: true,
  configurable: true,
})
