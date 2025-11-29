import { vi } from 'vitest'

// Mock browser API globally
global.browser = {
  runtime: {
    sendMessage: vi.fn(),
  },
} as any

// Ensure DOM is available
if (typeof document === 'undefined') {
  throw new Error('jsdom environment not loaded - check vitest config')
}
