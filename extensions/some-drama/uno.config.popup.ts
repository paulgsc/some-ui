import { defineSomeUiConfig } from "@some-ui/styles/config"

import { POPUP_SOURCES } from "./uno.sources"

export default defineSomeUiConfig(
  { preflight: true },
  {
    content: { filesystem: POPUP_SOURCES },
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
      // Harvested from tag names, identifiers and prose in the scanned modules
      // (`el("input")`, `btn` variables, "tab" / "badge" in comments).
      "badge",
      "btn",
      "input",
      "separator",
      "tab",
    ],
  }
)
