import { defineConfig } from "eslint/config"
import type { Config } from "typescript-eslint"

import {
  baseConfig,
  depsOverrideConfig,
  eslintPluginStorybook,
  extensionCharterPlugin,
  extensionsCharterConfig,
  extensionsSecurityConfig,
  reactConfig,
  switchLintConfig,
  switchLintPlugin,
  testsOverrideConfig,
  toolsOverrideConfig,
  typescriptConfig,
} from "./configs/index.js"

/**
 * Full recommended preset
 */
export const maishatuRecommended: Config = defineConfig(
  ...baseConfig,
  ...typescriptConfig,
  ...reactConfig,
  ...eslintPluginStorybook,
  toolsOverrideConfig,
  testsOverrideConfig,
  depsOverrideConfig
)

/**
 * Non-stylistic preset
 */
export const maishatuNonStylistic: Config = defineConfig(
  ...baseConfig,
  ...typescriptConfig,
  ...reactConfig,
  ...eslintPluginStorybook,
  toolsOverrideConfig,
  testsOverrideConfig
)

// ── Extension configs ──────────────────────────────────────────────────────

export {
  extensionsSecurityConfig,
  extensionsCharterConfig,
  extensionCharterPlugin,
}

// ── Switch-statement idiom rules ───────────────────────────────────────────
//
// Opt-in only — not included in maishatuRecommended/extensionsRecommended.
// See switch-lint.config.ts for adoption instructions.
export { switchLintConfig, switchLintPlugin }

/**
 * Recommended preset for browser-extension workspaces.
 * Extends maishatuRecommended with AMO security rules and Good-Citizen Charter lints.
 */
export const extensionsRecommended: Config = [
  ...maishatuRecommended,
  ...extensionsSecurityConfig,
  ...extensionsCharterConfig,
]

/**
 * Default export
 */
export default maishatuRecommended
