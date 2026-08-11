import { structuralColorRatchet, uiRecommended } from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

export default defineConfig([
  ...uiRecommended,

  // Demo/fixture surfaces: they render only in stories and local
  // harnesses, never in an app, so their fixed neutrals are not a user-
  // visible theming gap. The rest of this package is migrated.
  ...structuralColorRatchet(["src/demo/**"]),
])
