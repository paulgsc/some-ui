import type { BuildContext } from "@some-extension/common/build"

const context: BuildContext = {
  default: {
    alias: { "@drama": "src" },
    entries: [
      // Classic contexts (MV2 content script + background script): IIFE.
      { name: "content", input: "src/content/content.ts", format: "iife" },
      {
        name: "background",
        input: "src/background/background.ts",
        format: "iife",
      },
      // Popup is loaded via <script type="module">, so ES output is fine.
      { name: "popup", input: "popup.html", format: "es" },
    ],
  },
}

export default context
