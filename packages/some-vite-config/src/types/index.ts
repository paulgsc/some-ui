import type { PluginOption, UserConfig } from "vite"

export type ViteConfigOptions = {
  /** Package name for the library build */
  packageName: string
  /** Library entry point relative to package root */
  entry?: string
  /** Library display name for UMD builds */
  libraryName?: string
  /** Custom alias mapping */
  alias?: Record<string, string>
  /** Additional external dependencies */
  additionalExternals?: Array<string>
  /**
   * @deprecated No longer used - tsconfig paths are now resolved natively
   * via Vite's `resolve.tsconfigPaths` (see createResolveConfig), which
   * replaced the vite-tsconfig-paths plugin. Kept as an accepted (ignored)
   * field so existing call sites don't need to update in this pass.
   */
  tsConfigPaths?: Record<"projects", Array<string>>
  /**
   * Build formats to generate. Defaults to ESM only: every library here is
   * `"type": "module"` and private, and nothing in the workspace loads one
   * with `require()`. Each extra format is another full bundle pass.
   */
  formats?: Array<"es" | "cjs" | "umd" | "iife">
  /** Additional plugins */
  additionalPlugins?: Array<PluginOption>
  /** Override any part of the config */
  configOverrides?: Partial<UserConfig>
  /**
   * Whether to auto-update package.json with build fields. Defaults to true.
   *
   * The sync runs as a build-only plugin hook (`vite build`, after the bundle
   * is written), never while this config is being constructed - so loading a
   * vite.config.ts for analysis (knip, IDE tooling) leaves the manifest
   * untouched.
   */
  updatePackageJson?: boolean
}
