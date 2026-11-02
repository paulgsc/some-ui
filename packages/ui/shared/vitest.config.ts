import { defineDomTest } from "@some-ui/vite-config/vitest"

// `lib/` is plain TypeScript; the take pattern's parts
// (`components/patterns/take`) are rendered in jsdom over the real pattern
// runtime and the shared simulated microphone. Other components are covered
// where an activity mounts them (`@some-ui/leetype`, `@some-ui/topik`).
export default defineDomTest({
  include: ["src/**/*.test.{ts,tsx}"],
  setupFiles: ["./vitest.setup.ts"],
})
