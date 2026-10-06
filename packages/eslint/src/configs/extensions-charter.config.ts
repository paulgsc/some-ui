import {
  noLogicLayerSideEffects,
  noRawStorage,
  noUnprefixedNamespace,
  noZindexEscalation,
  requireNamedLifetime,
  requireScopedLifetime,
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
    "require-named-lifetime": requireNamedLifetime,
    "require-scoped-lifetime": requireScopedLifetime,
  },
}

/**
 * Base Charter config: registers the plugin and enables the rules that
 * have safe workspace-agnostic defaults (z-index, raw storage, and the
 * lifetime rules).
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
      // §5 (see the rule's doc for why it is not a cleanup-pairing check).
      // The message points at commons' `Disposables`, whose interval() and
      // loop() attach a lifetime; a workspace with its own helper passes a
      // different `lifecycleModule`.
      "extension-charter/require-named-lifetime": [
        "error",
        { lifecycleModule: "@some-extension/common's Disposables" },
      ],
      // §8, the listener and frame-loop half. `warn`: an audit everywhere; a
      // workspace that has adopted a lifetime helper turns it to "error" in
      // its own eslint.config.js, as some-drama does.

      "extension-charter/require-scoped-lifetime": [
        "warn",
        { lifecycleModule: "@some-extension/common's Disposables" },
      ],
    },
  },
])

export default extensionsCharterConfig
