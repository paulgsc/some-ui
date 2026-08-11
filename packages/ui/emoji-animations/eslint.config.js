import { structuralColorRatchet, uiRecommended } from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

export default defineConfig([
  ...uiRecommended,

  // Not yet migrated to semantic tokens for structural roles. See
  // `structuralColorRatchet` in @some-ui/eslint-kit for what this defers and
  // what it deliberately does not: `theme-protocol/no-theme-boundary` stays
  // on. Delete this block once the fixed neutrals in this package have been
  // read role by role and replaced.
  ...structuralColorRatchet(),
])
