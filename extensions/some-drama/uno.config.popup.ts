import { defineSomeUiConfig } from "@some-ui/styles/config"

export default defineSomeUiConfig(
  { preflight: true },
  {
    content: {
      filesystem: [
        "src/**/*.{ts,tsx,html}",
        "popup.html",
        "src/styles/popup.css",
        "src/styles/components/popup/**/*.css",
      ],
    },
    blocklist: [
      "container",
      "contents",
      "grid",
      "hidden",
      "inline",
      "fixed",
      "static",
      "border",
      "shadow",
      "surface",
      "label",
      "visible",
      "transform",
      "transition",
      "resize",
      "root",
      "inner",
      "wrap",
      "active",
      "open",
      "card",
      "panel",
      "track",
      "fill",
      "dot",
      "text",
      "ms",
      "px",
    ],
  }
)
