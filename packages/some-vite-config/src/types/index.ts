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
   * Custom DTS plugin options.
   *
   * `exclude` is layered ON TOP of the centralized excludes createPlugins()
   * always applies (tests, spec, stories, __tests__, __mocks__) plus the
   * content-package globs when `contentPackage` is set. Use it ONLY for globs
   * genuinely specific to one package (e.g. "**\/obs-monitor/**"). Do NOT
   * re-list a centralized category here (test/story/data/assets/shared-content
   * paths) — that is the per-workspace whack-a-mole the build-hygiene ESLint
   * rule (no-manual-build-exclude) forbids; add new shared-content workspaces
   * to createPlugins instead so every consumer inherits the exclude.
   *
   * Declaration emit is pointed at the package's tsconfig.build.json when one
   * exists (see createPlugins), so that file's include/exclude is the single
   * source of truth shared with the `tsc -p tsconfig.build.json` typecheck
   * pass — no separate dts-only exclude list to keep in sync.
   */
  dtsOptions?: {
    insertTypesEntry?: boolean
    exclude?: Array<string>
  }
  /**
   * Set for packages/ui/* workspaces that source-alias into the shared
   * some-content / some-content-registry / assets workspaces (see each
   * package's tsconfig "include"). Adds the canonical dts exclude globs for
   * those cross-package paths centrally, so a new shared-content workspace is
   * added in ONE place (createPlugins) rather than per consumer's dtsOptions.
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
