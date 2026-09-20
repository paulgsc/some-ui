import {
  noLogicLayerSideEffects,
  noRawStorage,
  noUnprefixedNamespace,
  noZindexEscalation,
  requireNamedLifetime,
  requireStoryTitlePrefix,
} from "@eslint/rules/index.js"
import { defineConfig } from "eslint/config"

/**
 * Plugin object containing all Good-Citizen Charter lint rules.
 *
 * Import extensionsCharterConfig for the base config (z-index + raw-storage on
 * by default), then add workspace-specific overrides for the two rules that
 * require per-workspace configuration:
 *
 *   - extension-charter/no-unprefixed-namespace  → requires { prefix } option
 *   - extension-charter/no-logic-layer-side-effects → enable via `files` glob
 *     pointing at your workspace logic directories (e.g. lib/fsm.ts, logic/)
 */
export const extensionCharterPlugin = {
  meta: { name: "extension-charter", version: "0.0.1" },
  rules: {
    "no-unprefixed-namespace": noUnprefixedNamespace,
    "no-zindex-escalation": noZindexEscalation,
    "no-logic-layer-side-effects": noLogicLayerSideEffects,
    "no-raw-storage": noRawStorage,
    "require-story-title-prefix": requireStoryTitlePrefix,
    "require-named-lifetime": requireNamedLifetime,
  },
}

/**
 * Base Charter config: registers the plugin and enables the rules that
 * have safe workspace-agnostic defaults (z-index, raw storage, and the
 * "Extensions/" story title prefix that .storybook/unocss-decorator.tsx
 * relies on to scope UnoCSS output to extension stories only).
 *
 * The other two rules require per-workspace configuration:
 *   - no-unprefixed-namespace  → needs `prefix` option
 *   - no-logic-layer-side-effects → needs `files` glob to select logic dirs
 */
const extensionsCharterConfig = defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx,cts,mts}"],
    plugins: {
      "extension-charter": extensionCharterPlugin,
    },
    rules: {
      "extension-charter/no-zindex-escalation": "error",
      "extension-charter/no-raw-storage": "error",
      // §5, added after a 200-tab profile hung the browser on three 250ms
      // polls per tab. Every one of those polls already had a matching
      // clearInterval — see the rule's own doc comment for why that is
      // precisely the reason this is not a cleanup-pairing check.
      //
      // Workspace-agnostic by default: it names no module, so the message
      // falls back to generic wording. A workspace with its own lifecycle
      // helper should pass `lifecycleModule` so the error points at it.
      "extension-charter/require-named-lifetime": "error",
    },
  },
  {
    files: ["**/*.stories.tsx"],
    plugins: {
      "extension-charter": extensionCharterPlugin,
    },
    rules: {
      "extension-charter/require-story-title-prefix": [
        "error",
        { prefix: "Extensions/" },
      ],
    },
  },
])

export default extensionsCharterConfig
