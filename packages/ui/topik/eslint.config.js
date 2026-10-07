import { paletteRatchet, uiRecommended } from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

export default defineConfig([
  ...uiRecommended,

  // Wide-window surfaces (DesktopSession, which chooseSurface picks unless
  // the window is narrower than 768px or shorter than 480px: desktop, and the
  // APK on a tablet; a phone gets HandheldLesson). Left on literal status hues
  // because that experience is being rebuilt to mirror the phone's. Delete
  // each glob when it migrates or goes.
  ...paletteRatchet(
    [
      "src/components/topik/chat-panel/index.tsx",
      "src/components/topik/quiz-states/quiz-summary/index.tsx",
    ],
    ["status"]
  ),
])
