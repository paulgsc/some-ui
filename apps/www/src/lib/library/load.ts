/**
 * Loads every `extension` file under `rootPath` into a keyed library:
 * raw file (`TRaw`) -> validated domain value (`TValidated`), keyed by `TKey`.
 * Every error is preserved and traceable, never collapsed: a fallback fills
 * the slot but its file's error stays in `fileErrors`.
 *
 * `loadLibrary` never rejects: discovery failing, or strict mode seeing any
 * file error, is its `fatal` outcome. It holds no state; the caller's query
 * cache owns the load, so every reader of one library joins one load
 * (QO1, `components/composer/scene-editor/use-scene-library.ts`).
 */

import type { FileDiscovery, ResourceLoader } from "@some-ui/fetch-kit"
import type { ZodType } from "zod"

type LibraryStage =
  | "discovery"
  | "load"
  | "validation"
  | "normalize"
  | "fallback"

type LibraryFileError<TKey extends string = string> = {
  key: TKey
  path: string
  stage: LibraryStage
  /** Original error object (never stringified) */
  cause: unknown
  id: string
}

/** Discovery failed, or strict mode saw any file error. */
type LibraryFatalError = {
  stage: "discovery"
  cause: unknown
}

export type LibraryConfig<TRaw, TValidated, TKey extends string = string> = {
  rootPath: string
  extension: string
  discovery: FileDiscovery
  loader: ResourceLoader
  rawSchema: ZodType<TRaw>
  normalize: (key: TKey, raw: TRaw) => TValidated
  /** Optional fallback for failed loads (does NOT hide errors) */
  fallback?: (key: TKey) => TValidated
  deriveKey: (fullPath: string) => TKey
  /** Strict mode: fail entire library if any file fails (default: false) */
  strict?: boolean
}

export type LibraryLoad<TValidated, TKey extends string> =
  | {
      kind: "loaded"
      library: Map<TKey, TValidated>
      fileErrors: Array<LibraryFileError<TKey>>
    }
  | { kind: "fatal"; error: LibraryFatalError }

export async function loadLibrary<TRaw, TValidated, TKey extends string>(
  config: LibraryConfig<TRaw, TValidated, TKey>
): Promise<LibraryLoad<TValidated, TKey>> {
  try {
    const files = await config.discovery.listFiles(
      config.rootPath,
      config.extension
    )

    const nextLibrary = new Map<TKey, TValidated>()
    const nextFileErrors: Array<LibraryFileError<TKey>> = []

    await Promise.all(
      files.map(async (filePath) => {
        const key = config.deriveKey(filePath)

        let rawUnknown: unknown
        try {
          rawUnknown = await config.loader.load(filePath)
        } catch (err) {
          nextFileErrors.push({
            key,
            path: filePath,
            stage: "load",
            cause: err,
            id: `load:${filePath}`,
          })
          return
        }

        const parsed = config.rawSchema.safeParse(rawUnknown)
        if (!parsed.success) {
          nextFileErrors.push({
            key,
            path: filePath,
            stage: "validation",
            cause: parsed.error,
            id: `validation:${filePath}`,
          })
          return
        }

        try {
          const normalized = config.normalize(key, parsed.data)
          nextLibrary.set(key, normalized)
        } catch (err) {
          nextFileErrors.push({
            key,
            path: filePath,
            stage: "normalize",
            cause: err,
            id: `normalize:${filePath}`,
          })
        }
      })
    )

    if (config.fallback) {
      for (const error of nextFileErrors) {
        if (!nextLibrary.has(error.key)) {
          try {
            const fallback = config.fallback(error.key)
            nextLibrary.set(error.key, fallback)
          } catch (fallbackErr) {
            nextFileErrors.push({
              key: error.key,
              path: error.path,
              stage: "fallback",
              cause: fallbackErr,
              id: `fallback:${error.path}`,
            })
          }
        }
      }
    }

    if (config.strict && nextFileErrors.length > 0) {
      throw new Error(
        `Strict mode: ${nextFileErrors.length} file(s) failed to load. ` +
          `Keys: ${nextFileErrors.map((e) => e.key).join(", ")}`
      )
    }

    return { kind: "loaded", library: nextLibrary, fileErrors: nextFileErrors }
  } catch (err) {
    return { kind: "fatal", error: { stage: "discovery", cause: err } }
  }
}
