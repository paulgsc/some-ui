import { defineSomeUiConfig } from "@some-ui/styles/config"

export default defineSomeUiConfig(
  { preflight: false },
  {
    content: {
      filesystem: [
        "src/**/*.{ts,tsx,html}",
        "src/styles/content.css",
        "src/styles/components/*.css",
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
      "layer",
      "root",
      "inner",
      "wrap",
      "ring",
      "slide",
      "active",
      "open",
      "pill",
      "card",
      "strip",
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
