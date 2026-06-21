import { defineSomeUiConfig } from "./src/config"

/**
 * Base UnoCSS config for `@some-ui/styles`.
 *
 * Two roles:
 *  1. Reference config an extension can copy/extend in its own
 *     `uno.config.ts`.
 *  2. Drives `pnpm build:css`, which compiles `examples/` into a static
 *     stylesheet — a concrete demonstration that the dev-time utilities
 *     become plain runtime CSS with no engine attached.
 */
export default defineSomeUiConfig(
  { includeShortcutLibrary: true },
  {
    content: {
      filesystem: ["examples/**/*.{html,ts,tsx}"],
    },
  }
)
