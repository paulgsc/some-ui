import {
  noGreedyOverflow,
  noUnshrinkableFlexChild,
} from "@eslint/rules/index.js"
import { defineConfig } from "eslint/config"

/**
 * Plugin enforcing the "content fits its box" idiom for overlay surfaces.
 *
 * A dialog, drawer, sheet, or popover is a *bounded* surface: the box is
 * chosen by the layout, and the content's job is to fit it. Reaching for
 * `overflow-y-auto` inverts that — it lets the content decide it is too big
 * and hands the remainder to a scrollbar, which is why long panels end up
 * with cut-off headers, doubled scrollbars, and a different amount of
 * unreachable content at every viewport height.
 *
 * The fixes this rule is pointing at, in rough order of preference:
 *
 *   1. Split heterogeneous content across tabs, so each pane is short.
 *   2. Page a homogeneous list to the measured fit (`useFittedPage` +
 *      `PageControls` in @some-ui/shared).
 *   3. Navigate with a rail/sidebar, rendering one group at a time.
 *   4. Enlarge the surface — a wider or taller dialog is allowed.
 *   5. Only then, scroll, and say so.
 *
 * This is the authoring-time half; apps/www's tests/ui-fit sweep proves the
 * result, since a lint rule sees only the class name.
 */
export const fitsTheBoxPlugin = {
  meta: { name: "fits-the-box", version: "0.0.1" },
  rules: {
    "no-greedy-overflow": noGreedyOverflow,
    "no-unshrinkable-flex-child": noUnshrinkableFlexChild,
  },
}

export default defineConfig([
  {
    files: ["**/*.{ts,tsx,jsx}"],
    plugins: { "fits-the-box": fitsTheBoxPlugin },
    rules: {
      // The structural half (#899): a flexible child that cannot shrink below
      // its content raises every ancestor's floor. It reads a flex
      // parent/child relationship, not a single class.

      "fits-the-box/no-unshrinkable-flex-child": "warn",
      "fits-the-box/no-greedy-overflow": [
        "warn",
        {
          // Surfaces whose entire purpose is a long scrollable region. Kept
          // as an explicit list so adding one is a decision someone makes on
          // the record, not a class name that slipped through.
          allowInFiles: [
            // Primitives whose scroll *is* the primitive: a command palette's
            // result list, a table's overflow wrapper, a scroll area.
            "ui/command",
            "ui/table",
            "scroll-area",
            "sidebar",
            // Surfaces whose length belongs to the author, not the layout.
            "code-display",
            "chat",
            "resume",
            "slideshow",
          ],
        },
      ],
    },
  },
])
