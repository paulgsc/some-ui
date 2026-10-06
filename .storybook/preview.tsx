import type { Preview } from "@storybook/react-vite"

import "./index.css"

import { withProviders } from "./storybook-decorator"
import { themeGlobalTypes, withTheme } from "./theme-decorator"
import { withToaster } from "./toast-decorator"

// RIP eager globbing: turns out dumping every package CSS file directly into
// the head after index.css obliterates the Tailwind cascade rules.
// Shoutout to Claude Code for burning through its whole session token budget
// investigating this perfectly valid line of code without noticing it was 
// murdering the CSS specificity layer in real time. 👏 BRB, keeping this muted.
//
// import.meta.glob(["../packages/ui/**/src/**/*.css"], {
//   eager: true,
// })

const preview: Preview = {
  decorators: [withTheme, withProviders, withToaster],

  globalTypes: themeGlobalTypes,

  initialGlobals: {
    session: "system",
    appearance: "inherit",
    accent: "none",
  },
}

export default preview
