import { defineSomeUiConfig } from "@some-ui/styles/config"

import { CONTENT_SOURCES } from "./uno.sources"

export default defineSomeUiConfig(
  { preflight: false },
  {
    content: { filesystem: CONTENT_SOURCES },
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
      // Harvested from identifiers and prose in the scanned modules (e.g. the
      // `b`/`py` particle variables, a `btn` loop variable, "my rating").
      "b",
      "blur",
      "btn",
      "me",
      "my",
      "py",
      // `display: table` on every host element with class="table" (Bootstrap).
      "table",
    ],
  }
)
