// The shared jsdom + Testing Library setup. Importing it here, rather than
// naming it in vitest.config.ts, keeps jest-dom's matcher types in tsconfig.json.
import "@some-ui/vite-config/vitest/setup"
