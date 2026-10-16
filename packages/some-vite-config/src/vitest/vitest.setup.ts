/**
 * The jsdom + Testing Library setup shared by the component workspaces: each
 * one's own `vitest.setup.ts` imports this (which also brings jest-dom's
 * matcher types into that workspace's tsconfig). DOM cleanup and mock
 * clearing need no hook: `defineDomTest` turns on `globals`, which lets
 * Testing Library register its own `cleanup`, and Vitest's `clearMocks`
 * defaults to true.
 */
import "@testing-library/jest-dom/vitest"

import { afterEach, vi } from "vitest"

afterEach(() => {
  vi.useRealTimers()
})
