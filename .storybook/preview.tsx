import type { Preview } from "@storybook/react-vite"

import "./index.css"
// eslint-disable-next-line import/no-unresolved -- virtual module provided by the UnoCSS vite plugin
import "virtual:uno.css"

import { withProviders } from "./storybook-decorator"
import { themeGlobalTypes, withTheme } from "./theme-decorator"

// Import all CSS files from packages' source trees only. Each package also
// ships a prebuilt `dist/*.css` (its own standalone Tailwind compile, used by
// consumers outside Storybook) — matching those here loads a frozen snapshot
// of the design system alongside the live one, and whichever loads last wins
// the cascade, silently overriding current tokens/themes with stale ones.
import.meta.glob(["../packages/ui/**/src/**/*.css"], {
  eager: true,
})

const preview: Preview = {
  decorators: [withTheme, withProviders],

  globalTypes: themeGlobalTypes,

  initialGlobals: {
    mode: "light",
    theme: "none",
  },

  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },

  tags: ["autodocs"],
}

export default preview
