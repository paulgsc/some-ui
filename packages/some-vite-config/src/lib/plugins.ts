import { existsSync } from "fs"
import { resolve } from "path"
import react from "@vitejs/plugin-react"
import ts from "typescript"
import type { PluginOption } from "vite"
import dts from "vite-plugin-dts"
import type { PluginOptions as DtsPluginOptions } from "vite-plugin-dts"

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
//
// `afterDiagnostic`'s own diagnostics list is declaration + semantic + syntactic
// only - it does NOT include options diagnostics (e.g. a `compilerOptions.types`
// entry that doesn't resolve - TS2688, confirmed via `program.getOptionsDiagnostics()`,
// NOT `getGlobalDiagnostics()`, which returns nothing for this case) or config-file
// parsing diagnostics. `tsc -p tsconfig.build.json` reported TS2688; this plugin's
// own diagnostics list silently didn't. `ts.getPreEmitDiagnostics(program)` is
// TypeScript's own canonical aggregation of exactly those categories (config-file
// parsing + options + syntactic + global + semantic - confirmed it reports the
// TS2688 case), so that plus this plugin's own declaration diagnostics is the
// complete set. `afterBootstrap` is the one hook that hands back the underlying
// `ts.Program` (`Runtime` keeps it `protected`; `getProgram()` is its public
// accessor), so `createPlugins` stashes it there and folds `getPreEmitDiagnostics`
// into the same check.
//
// `getPreEmitDiagnostics` still misses one more thing: `program.getConfigFileParsingDiagnostics()`
// only returns something if the `ts.Program` was constructed WITH a
// `configFileParsingDiagnostics` argument - unplugin-dts's own `ts.createProgram({host,
// rootNames, options, projectReferences})` call doesn't pass one (confirmed by
// replicating its exact parse-then-createProgram sequence in a standalone script), so
// a config-file-level error - an unknown compiler option, TS5023 - never reaches the
// Program at all, and no amount of querying that Program recovers it. `tsc -p` parses
// the same file itself and catches it independently of the Program. The fix here does
// the same: parse the tsconfig this plugin is already pointed at a second time, cheaply
// (`ts.readConfigFile` + `ts.parseJsonConfigFileContent` - a JSON parse and an extends-
// chain resolution, not a type-checked program build), and fail on `.errors` directly.
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

  // Same file vite-plugin-dts itself resolves to (its own fallback, when no
  // tsconfig.build.json exists, is `ts.findConfigFile` from the package root).
  const effectiveConfigPath = existsSync(buildTsconfigPath)
    ? buildTsconfigPath
    : ts.findConfigFile(packageRoot, ts.sys.fileExists)

  const configDiagnostics: ReadonlyArray<ts.Diagnostic> = effectiveConfigPath
    ? (() => {
        const configFile = ts.readConfigFile(
          effectiveConfigPath,
          ts.sys.readFile
        )
        if (configFile.error) return [configFile.error]
        return ts.parseJsonConfigFileContent(
          configFile.config,
          ts.sys,
          resolve(effectiveConfigPath, "..")
        ).errors
      })()
    : []

  let program: ts.Program | undefined

  const finalDtsOptions: DtsPluginOptions = {
    insertTypesEntry: true,
    ...tsconfigPath,
    ...dtsOptions,
    exclude: mergedExclude,
    afterBootstrap: (runtime) => {
      program = runtime.getProgram()
    },
    afterDiagnostic: (diagnostics) => {
      const preEmitDiagnostics = program
        ? ts.getPreEmitDiagnostics(program)
        : []
      failOnDiagnostics([
        ...new Set([
          ...diagnostics,
          ...preEmitDiagnostics,
          ...configDiagnostics,
        ]),
      ])
    },
  }

  return [react(), dts(finalDtsOptions), ...additionalPlugins]
}
