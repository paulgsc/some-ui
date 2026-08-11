import { structuralColorRatchet, uiRecommended } from "@some-ui/eslint-kit"
import tseslint from "typescript-eslint"

export default tseslint.config(
  ...uiRecommended,
  {
    files: ["vite.config.ts"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  // Demo/fixture surfaces: the building/TV shape primitives render only in
  // stories and local harnesses, never in an app, so their fixed neutrals are
  // not a user-visible theming gap. The rest of this package is migrated.
  ...structuralColorRatchet(["src/components/shapes/**"])
)
