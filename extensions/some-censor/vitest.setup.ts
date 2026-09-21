import { vi } from "vitest"

// Mock browser API globally
vi.stubGlobal("browser", {
  runtime: {
    sendMessage: vi.fn(),
  },
})

// The suite runs under jsdom by default (vitest.config.ts). One exception is
// deliberate: `src/lib/content/core/core.test.ts` opts into the node
// environment with a `@vitest-environment` pragma, because proving the Core
// needs no DOM means running it where there is none (BC3, #1436). So no
// "is jsdom loaded" guard here — a DOM test on a missing DOM fails loudly on
// its own first `document` access.
