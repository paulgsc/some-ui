import type { Preview } from "@storybook/react-vite"

import "./index.css"
// eslint-disable-next-line import/no-unresolved -- virtual module provided by the UnoCSS vite plugin
import "virtual:uno.css"

import { withProviders } from "./storybook-decorator"
import { themeGlobalTypes, withTheme } from "./theme-decorator"

// Import all CSS files from packages
import.meta.glob(["../packages/ui/**/*.css"], {
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
    options: {
      storySort: {
        order: ["Introduction", "Docs", "Content", "*"],
      },
    },
  },

  tags: ["autodocs"],
}

export default preview
