import {
  statusColorRatchet,
  structuralColorRatchet,
  uiRecommended,
} from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

export default defineConfig([
  ...uiRecommended,

  // Not yet migrated to semantic tokens, and not doable a file at a time: the
  // hangul HUD is painted white on a fixed dark gradient, so migrating the
  // substrate alone turns it near-white under a light theme. Deciding the
  // light-mode canvas is design work; delete this block with that decision
  // (likely a registered `feature` appearance, like `.code` and `.cdrama`).
  // Scoped to the files that predate the rule (plus HexGrid's legacy
  // loading/error literals); remove each as it migrates.

  ...structuralColorRatchet([
    "src/components/hangul-hex-grid/**",
    "src/components/hex-grid/index.tsx",
  ]),

  // The same fixed dark canvas carries the HUD's correct/missed/warning hues,
  // and a theme's --success is tuned for the theme's own ground, not this
  // one. Migrates with the substrate above.
  ...statusColorRatchet([
    "src/components/hangul-hex-grid/**",
    "src/components/hex-grid/index.tsx",
  ]),
])
