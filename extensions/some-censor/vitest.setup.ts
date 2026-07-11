import { vi } from "vitest"

// Mock browser API globally
vi.stubGlobal("browser", {
  runtime: {
    sendMessage: vi.fn(),
  },
})

// Ensure DOM is available
if (typeof document === "undefined") {
  throw new Error("jsdom environment not loaded - check vitest config")
}
