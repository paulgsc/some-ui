import "@testing-library/jest-dom/vitest"

import { cleanup } from "@testing-library/react"
import { afterEach, vi } from "vitest"

afterEach(() => {
  // Cleans up the DOM (rendered hooks)
  cleanup()
  // Clears all mock call history and resets timers
  vi.clearAllMocks()
  vi.useRealTimers()
})
