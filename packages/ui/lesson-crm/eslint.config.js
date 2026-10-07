import { paletteRatchet, uiRecommended } from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

export default defineConfig([
  ...uiRecommended,

  // Desktop-only (the lan audience, not in the APK build), left on literal
  // status hues because the desktop experience is being rebuilt to mirror the
  // APK. Delete the glob when it migrates or goes.
  ...paletteRatchet(["src/components/round-crm/index.tsx"], ["status"]),
])
