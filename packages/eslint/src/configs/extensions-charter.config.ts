import { defineConfig } from "eslint/config"

import {
  noLogicLayerSideEffects,
  noRawStorage,
  noUnprefixedNamespace,
  noZindexEscalation,
} from "../rules/index.js"

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
  },
}

/**
 * Base Charter config: registers the plugin and enables the two rules that
 * have safe workspace-agnostic defaults (z-index + raw storage).
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
    },
  },
])

export default extensionsCharterConfig
