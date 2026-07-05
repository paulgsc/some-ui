import type { UserConfig } from "vite"

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
  tsConfigPaths?: Record<"projects", Array<string>>
  /** Build formats to generate */
  formats?: Array<"es" | "cjs" | "umd" | "iife">
  /** Additional plugins */
  additionalPlugins?: Array<any>
  /** Override any part of the config */
  configOverrides?: Partial<UserConfig>
  /** Whether to auto-update package.json with build fields */
  updatePackageJson?: boolean
}
