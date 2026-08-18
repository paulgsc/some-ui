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
 * This is the fast, authoring-time half of the guard. The half that actually
 * proves the result is apps/www's tests/ui-fit sweep, which renders every
 * story at three viewport sizes and fails on anything that overflows or
 * scrolls greedily — a lint rule can only see the class name, not whether the
 * content ended up fitting.
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
      // The structural half of the idiom, and the one #899 needed: a flexible
      // child that cannot shrink below its content raises the floor of every
      // box above it, so a panel handed a small rect paints past it. Unlike
      // the rule below this one reads a *relationship* (a flex parent and its
      // flexible child) rather than a single class, which is what lets it name
      // the defect rather than the symptom.
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
