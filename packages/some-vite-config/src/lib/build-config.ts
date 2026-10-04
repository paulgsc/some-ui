import { resolve } from "path"

import type { ViteConfigOptions } from "@/types/index.js"

/**
 * ESM only. The library build and the package.json it generates must agree on
 * this, so both read it from here.
 */
export const DEFAULT_FORMATS: NonNullable<ViteConfigOptions["formats"]> = ["es"]

const DEFAULT_ENTRY = "src/index.ts"

/**
 * Absolute path to the package's library entry point. Single source of truth
 * for the `src/index.ts` default - the package.json sync uses this to prove
 * the packageRoot it was handed really is the package it just built.
 */
export function resolveEntryPath(
  options: ViteConfigOptions,
  packageRoot: string
): string {
  const { entry = DEFAULT_ENTRY } = options
  return resolve(packageRoot, entry)
}

/** One file a library build emits and its package.json exports. */
export type LibraryEntry = {
  /** The export subpath: "." for the main entry, "./http" for `entries.http`. */
  subpath: string
  /** The output path under dist/ without format or extension: "@some-ui/speech/http". */
  outputName: string
  /** The entry's source, relative to the package root. */
  source: string
}

/**
 * Every entry the build emits, main first. The library build, the published
 * declarations and the generated package.json all read this, so a subpath
 * cannot be built without being exported, or exported without its types.
 */
export function libraryEntries(
  options: ViteConfigOptions
): Array<LibraryEntry> {
  const { packageName, entry = DEFAULT_ENTRY, entries = {} } = options
  return [
    { subpath: ".", outputName: packageName, source: entry },
    ...Object.entries(entries).map(([name, source]) => {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
        throw new Error(
          `[some-ui:entries] "${name}" is not a subpath name: use lowercase letters, digits and dashes.`
        )
      }
      return {
        subpath: `./${name}`,
        outputName: `${packageName}/${name}`,
        source,
      }
    }),
  ]
}

export function createBuildConfig(
  options: ViteConfigOptions,
  packageRoot: string
): {
  lib: {
    entry: string | Record<string, string>
    name: string
    fileName: (format: string, entryName: string) => string
    formats: NonNullable<ViteConfigOptions["formats"]>
  }
} {
  const { packageName, libraryName, formats = DEFAULT_FORMATS } = options

  const entries = libraryEntries(options)
  const defaultLibraryName =
    libraryName ||
    packageName.replace(/[-_]/g, "").replace(/^./, (c) => c.toUpperCase())

  return {
    lib: {
      // A single entry stays a string, so a package without subpaths builds
      // exactly as before. With subpaths, each entry is named by its output
      // path, and the file name follows it.
      entry:
        entries.length === 1
          ? resolveEntryPath(options, packageRoot)
          : Object.fromEntries(
              entries.map((entry) => [
                entry.outputName,
                resolve(packageRoot, entry.source),
              ])
            ),
      name: defaultLibraryName,
      fileName: (format: string, entryName: string): string =>
        `${entries.length === 1 ? packageName : entryName}.${format}.js`,
      formats,
    },
  }
}
