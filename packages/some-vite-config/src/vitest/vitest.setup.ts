/**
 * The jsdom + Testing Library setup shared by the component workspaces: each
 * one's own `vitest.setup.ts` imports this (which also brings jest-dom's
 * matcher types into that workspace's tsconfig).
 */
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
