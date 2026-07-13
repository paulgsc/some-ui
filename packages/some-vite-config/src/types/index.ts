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
  /** Custom DTS plugin options */
  dtsOptions?: {
    insertTypesEntry?: boolean
    exclude?: Array<string>
  }
  /**
   * Set for packages/ui/* workspaces that source-alias into the shared
   * some-content/assets workspaces (see each package's tsconfig "include").
   * Adds the canonical dts exclude globs for those cross-package paths.
   */
  contentPackage?: boolean
  /**
   * Overrides the default blanket "**\/data/**" dts exclude that
   * `contentPackage` adds. Some packages' `data/` directories mix genuinely
   * unbuildable fixtures (e.g. files importing image assets outside the
   * package's rootDir) with plain, exportable data modules - pass specific
   * globs here (e.g. ["**\/data/chat-messages.ts"]) to exclude only the
   * former and let the rest generate real declarations.
   */
  contentPackageDataExclude?: Array<string>
  /**
   * @deprecated No longer used - tsconfig paths are now resolved natively
   * via Vite's `resolve.tsconfigPaths` (see createResolveConfig), which
   * replaced the vite-tsconfig-paths plugin. Kept as an accepted (ignored)
   * field so existing call sites don't need to update in this pass.
   */
  tsConfigPaths?: Record<"projects", Array<string>>
  /** Build formats to generate */
  formats?: Array<"es" | "cjs" | "umd" | "iife">
  /** Additional plugins */
  additionalPlugins?: Array<PluginOption>
  /** Override any part of the config */
  configOverrides?: Partial<UserConfig>
  /** Whether to auto-update package.json with build fields */
  updatePackageJson?: boolean
}
