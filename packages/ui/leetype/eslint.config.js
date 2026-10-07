import { paletteRatchet, uiRecommended } from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

export default defineConfig([
  ...uiRecommended,

  // Left on literal status hues: the typing game renders only in windows at
  // least 768px wide (useIsMobile; desktop, and the APK on a tablet, while a
  // phone gets RoundSession), and that experience is being rebuilt to mirror
  // the phone's; claim-choices renders only inside ReadingSession, which no
  // host mounts. Delete each glob when it migrates or goes.
  ...paletteRatchet(
    [
      "src/components/typing-game/code-display/index.tsx",
      "src/components/typing-game/rationale-accordion/index.tsx",
      "src/components/reading-game/claim-choices/index.tsx",
    ],
    ["status"]
  ),
])
