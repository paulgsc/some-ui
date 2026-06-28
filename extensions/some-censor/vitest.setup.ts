import { vi } from "vitest"

// Mock browser API globally
/* eslint-disable @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any */
global.browser = {
  runtime: {
    sendMessage: vi.fn(),
  },
} as any
/* eslint-enable @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any */

// Ensure DOM is available
if (typeof document === "undefined") {
  throw new Error("jsdom environment not loaded - check vitest config")
}
