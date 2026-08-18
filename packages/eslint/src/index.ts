import { defineConfig } from "eslint/config"
import type { Config } from "typescript-eslint"

import {
  baseConfig,
  buildHygieneConfig,
  buildHygienePlugin,
  depsOverrideConfig,
  eslintPluginStorybook,
  extensionCharterPlugin,
  extensionsCharterConfig,
  extensionsSecurityConfig,
  fitsTheBoxConfig,
  fitsTheBoxPlugin,
  intentGuardConfig,
  intentGuardPlugin,
  lazyRegistryConfig,
  lazyRegistryPlugin,
  reactConfig,
  reactImportBanSelectors,
  reactPeerDependencyConfig,
  switchLintConfig,
  switchLintPlugin,
  tailwindIdiomConfig,
  tailwindIdiomPlugin,
  testsOverrideConfig,
  themeProtocolConfig,
  themeProtocolPlugin,
  toolsOverrideConfig,
  typescriptConfig,
  wasmLoaderGuardConfig,
} from "./configs/index.js"

/**
 * Full recommended preset
 */
export const maishatuRecommended: Config = defineConfig(
  ...baseConfig,
  ...typescriptConfig,
  ...reactConfig,
  ...reactPeerDependencyConfig,
  ...eslintPluginStorybook,
  ...wasmLoaderGuardConfig,
  ...buildHygieneConfig,
  ...switchLintConfig,
  ...tailwindIdiomConfig,
  ...fitsTheBoxConfig,
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
  ...reactPeerDependencyConfig,
  ...eslintPluginStorybook,
  ...wasmLoaderGuardConfig,
  ...buildHygieneConfig,
  ...tailwindIdiomConfig,
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
export { switchLintConfig, switchLintPlugin }

// ── Reusable no-restricted-syntax fragment for workspace-level overrides ───
// See its own doc comment in react.config.ts.
export { reactImportBanSelectors }

// ── Intent boundary guard (#937 S1) ─────────────────────────────────────────
export { intentGuardConfig, intentGuardPlugin }

// ── Tailwind static-classname idiom rules ──────────────────────────────────
export { fitsTheBoxConfig, fitsTheBoxPlugin }

// ── Theme protocol (reusable UI must inherit its theme, not choose one) ────
export { themeProtocolConfig, themeProtocolPlugin }
export { structuralColorRatchet } from "./configs/index.js"

// ── Lazy content-registry loading ──────────────────────────────────────────
export { lazyRegistryConfig, lazyRegistryPlugin }
export { tailwindIdiomConfig, tailwindIdiomPlugin }

// ── Library-build hygiene (centralized dts excludes) ───────────────────────
export { buildHygieneConfig, buildHygienePlugin }

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
 * Recommended preset for reusable UI workspaces (`packages/ui/*`).
 *
 * Extends maishatuRecommended with the theme protocol, which only means
 * something for a *library*. A host — apps/www, a story, an extension popup —
 * is the thing that legitimately picks a theme and opens a boundary; a
 * reusable component is the thing that must inherit one. Enforcing the rules
 * everywhere would flag exactly the hosts that are doing it right, so the
 * preset is scoped by who extends it, the same way `appsRecommended` and
 * `extensionsRecommended` are.
 */
export const uiRecommended: Config = [
  ...maishatuRecommended,
  ...themeProtocolConfig,
]

/**
 * Recommended preset for deployable apps (`apps/*`).
 *
 * Extends maishatuRecommended with the lints that only mean something for a
 * thing that ships a bundle. Today that is lazy-registry: a *host* is the
 * only place a static import can short-circuit the content registry's
 * dynamic boundary, because the host is what has an entry chunk. A library
 * importing a sibling library is ordinary composition, and linting it there
 * only manufactures exceptions.
 *
 * The parallel is `extensionsRecommended`, not `buildHygieneConfig` - the
 * latter stays in maishatuRecommended and self-limits by file glob
 * (`**\/vite.config.*`) plus call-site detection, so it is inert where it
 * does not apply. A lint that must look at every source file cannot do
 * that, so it is scoped by who extends it.
 */
export const appsRecommended: Config = [
  ...maishatuRecommended,
  ...lazyRegistryConfig,
]

/**
 * Default export
 */
export default maishatuRecommended
