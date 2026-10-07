import { statusColorRatchet, uiRecommended } from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

export default defineConfig([
  ...uiRecommended,

  // Desktop-only surfaces (DesktopSession; the phone renders HandheldLesson),
  // left on literal status hues because the desktop experience is being
  // rebuilt to mirror the APK. Delete each glob when it migrates or goes.
  ...statusColorRatchet([
    "src/components/topik/chat-panel/index.tsx",
    "src/components/topik/quiz-states/quiz-summary/index.tsx",
  ]),
])
