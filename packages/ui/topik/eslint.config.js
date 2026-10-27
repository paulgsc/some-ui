import {
  compiledPackageStyleImportBanPattern,
  paletteRatchet,
  parentRelativeImportPattern,
  routerImportBanPattern,
  themeProviderBanPattern,
  uiRecommended,
} from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

// src/lib/topik/index.ts is the package's public face for its components: it
// re-exports core and the React adapter together. A module inside
// src/lib/topik that imports it imports every sibling, the adapter's hooks
// included, and the barrel imports that module back: core reached React that
// way, and five runtime cycles ran through it (#2109). Inside, import the
// leaf module that declares the name.
const ownBarrelPattern = {
  regex: "^@topik/lib/topik(/index)?$",
  message:
    "Inside src/lib/topik, import the module that declares the name (e.g. @topik/lib/topik/core/session-types), not the package barrel: the barrel re-exports this module's siblings and imports them back, a cycle.",
}

const TESTS = ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"]

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

  // Flat config replaces this rule's options wholesale, so each block
  // restates what the preset sets for the same files: theme-protocol's four
  // patterns for source, base.config.ts's `../` ban for tests.
  {
    files: ["src/lib/topik/**/*.{ts,tsx}"],
    ignores: TESTS,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            parentRelativeImportPattern,
            themeProviderBanPattern,
            compiledPackageStyleImportBanPattern,
            routerImportBanPattern,
            ownBarrelPattern,
          ],
        },
      ],
    },
  },
  {
    files: TESTS.map((glob) => `src/lib/topik/${glob}`),
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [parentRelativeImportPattern, ownBarrelPattern] },
      ],
    },
  },
])
