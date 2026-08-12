import {
  extensionCharterPlugin,
  extensionsRecommended,
} from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

/**
 * `extensionsRecommended` already carries the two Charter rules that have
 * workspace-agnostic defaults (z-index escalation, raw storage). The other two
 * are opt-in *because they need a per-workspace answer*, and until now this
 * workspace had not given one — so neither was running here even though both
 * apply. That is what this config adds.
 */
export default defineConfig(
  ...extensionsRecommended,
  {
    // ── Charter §2: Logic ≠ Presentation ≠ Effects ──────────────────────────
    // This workspace's whole design rests on the claim that the state machine
    // is pure — fsm.ts F1–F4 and record.ts V1 are written as invariants about
    // exactly that, and DomHandle's docstring calls itself "the ONLY class
    // permitted to touch the DOM". Until now nothing checked it. These four
    // are the files that must stay testable without a DOM:
    //
    //   fsm.ts          transitions + the render projection
    //   record.ts       the pure identity record (V1: "zero DOM imports")
    //   selectors.ts    the card catalogue, also read by the stylesheet test
    //   veil-styles.ts  class strings; it names elements it must not touch
    //
    // extract/ is deliberately *not* here: it reads a DOM subtree, but only
    // through the element handed to it, never through a global — which is the
    // distinction the rule draws and the reason its functions are pure.
    files: [
      "src/lib/content/fsm.ts",
      "src/lib/content/record.ts",
      "src/lib/content/selectors.ts",
      "src/lib/content/veil-styles.ts",
      "src/types/**/*.ts",
    ],
    ignores: ["src/types/global.d.ts"],
    plugins: {
      "extension-charter": extensionCharterPlugin,
    },
    rules: {
      "extension-charter/no-logic-layer-side-effects": "error",
    },
  },
  {
    // ── Charter §4: one prefix, declared once ───────────────────────────────
    // some-censor's prefix is `boyo`, and it is load-bearing rather than
    // cosmetic: the pre-mask occluder, the event delegation in events.ts, the
    // reduced-motion rule in styles/content.css and the e2e suite all key off
    // `boyo-*` / `data-boyo*`. A class or data attribute that escapes the
    // namespace is invisible to all four.
    files: ["src/**/*.{js,mjs,ts,tsx}"],
    plugins: {
      "extension-charter": extensionCharterPlugin,
    },
    rules: {
      "extension-charter/no-unprefixed-namespace": [
        "error",
        {
          prefix: "boyo",
          allowlist: [
            // Set by YouTube, read by us — the hydration signal the observer
            // watches. Renaming it is not ours to do.
            "data-video-id",
          ],
        },
      ],
    },
  }
)
