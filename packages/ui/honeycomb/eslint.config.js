import { structuralColorRatchet, uiRecommended } from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

export default defineConfig([
  ...uiRecommended,

  // Not yet migrated to semantic tokens for structural roles, and unlike the
  // other deferrals this one is not merely unfinished — it cannot be done a
  // file at a time.
  //
  // The hangul canvas is painted for a fixed dark ground: 82 `text-white*` /
  // `bg-white/*` / `border-white/*` values across 13 files in the HUD, sitting
  // on a gradient whose middle stop is `via-purple-900` at every theme.
  // Migrating the two substrate endpoints alone (the mechanical change this
  // rule asks for) turns the edges near-white under a light session theme
  // while the HUD over them stays white — worse than the fixed palette it
  // replaced. Making the surface genuinely themeable means deciding what this
  // canvas looks like in light mode, which is design work, not substitution.
  //
  // Delete this block along with that decision — most likely by giving
  // honeycomb a registered `feature` appearance it opts into, which is the
  // shape `.code` and `.cdrama` already have.
  ...structuralColorRatchet(),
])
