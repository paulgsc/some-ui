import { existsSync } from "fs"
import { resolve } from "path"
import react from "@vitejs/plugin-react"
import ts from "typescript"
import type { PluginOption } from "vite"
import dts from "vite-plugin-dts"

import type { ViteConfigOptions } from "@/types/index.js"

const diagnosticsFormatHost: ts.FormatDiagnosticsHost = {
  getCurrentDirectory: () => process.cwd(),
  getCanonicalFileName: (fileName) => fileName,
  getNewLine: () => ts.sys.newLine,
}

// vite-plugin-dts (unplugin-dts under the hood) builds its own TypeScript
// program to emit .d.ts files, and that program computes the same semantic,
// syntactic and declaration diagnostics `tsc -p tsconfig.build.json` does —
// confirmed by deliberately introducing a type error, an unused local and a
// missing return and observing all three reported (TS2322, TS6133, TS2366).
// But by default it only logs them: `vite build` exits 0 regardless, because
// nothing calls back into Rollup's failure path for them (see #1447). This
// hook is what unplugin-dts exposes for exactly that gap - without it, the
// standalone `tsc` pass was the only thing standing between a type error and
// a green build, which is why removing that pass could not happen until this
// was wired up.
function failOnDiagnostics(diagnostics: ReadonlyArray<ts.Diagnostic>): void {
  if (diagnostics.length === 0) return
  const formatted = ts.formatDiagnosticsWithColorAndContext(
    diagnostics,
    diagnosticsFormatHost
  )
  throw new Error(
    `${diagnostics.length} type error${diagnostics.length === 1 ? "" : "s"} found while generating declarations:\n\n${formatted}`
  )
}

export function createPlugins(
  options: ViteConfigOptions,
  packageRoot: string
): Array<PluginOption> {
  const {
    dtsOptions = {},
    additionalPlugins = [],
    contentPackage = false,
    contentPackageDataExclude,
  } = options

  const defaultExclude = [
    "**/*.test.*",
    "**/*.spec.*",
    "**/*.stories.*",
    "**/__tests__/**",
    "**/__mocks__/**",
    "**/stories/**",
  ]

  // Packages that source-alias into the shared some-content / some-content-registry
  // /assets workspaces (packages/ui/* depth) exclude those cross-package paths,
  // plus their own demo/data fixtures, from declaration output. Keep new shared
  // content workspaces listed HERE (not in per-package vite.config dtsOptions) so
  // a single edit covers every consumer — see no-manual-build-exclude.
  const contentPackageExclude = contentPackage
    ? [
        "**/demo/**",
        ...(contentPackageDataExclude ?? ["**/data/**"]),
        "../../../assets/**/*",
        "../../some-content/src/**/*",
        "../../some-content-registry/src/**/*",
      ]
    : []

  const mergedExclude = [
    ...new Set([
      ...(dtsOptions.exclude ?? []),
      ...defaultExclude,
      ...contentPackageExclude,
    ]),
  ]

  // Single source of truth for the file set: point vite-plugin-dts at the
  // package's tsconfig.build.json when it exists, so the declaration-emit pass
  // and the `tsc -p tsconfig.build.json` typecheck pass are governed by the SAME
  // include/exclude. Without this, dts falls back to tsconfig.json (whose
  // `include` eagerly pulls in ../../some-content/**), and the only filter is the
  // dtsOptions.exclude list below — which then has to be hand-kept in sync with
  // tsconfig.build.json. The `exclude` globs above still layer on top as a
  // universal baseline (tests/stories/etc.) regardless of which tsconfig is used.
  const buildTsconfigPath = resolve(packageRoot, "tsconfig.build.json")
  const tsconfigPath = existsSync(buildTsconfigPath)
    ? { tsconfigPath: buildTsconfigPath }
    : {}

  const finalDtsOptions = {
    insertTypesEntry: true,
    ...tsconfigPath,
    ...dtsOptions,
    exclude: mergedExclude,
    afterDiagnostic: failOnDiagnostics,
  }

  return [react(), dts(finalDtsOptions), ...additionalPlugins]
}
