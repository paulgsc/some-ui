/**
 * Loads every `extension` file under `rootPath` into a keyed library:
 * raw file (`TRaw`) -> validated domain value (`TValidated`), keyed by `TKey`.
 * Every error is preserved and traceable, never collapsed.
 */

import { useEffect, useState } from "react"
import type { ZodType } from "zod"

import type { FileDiscovery, ResourceLoader } from ".."

type LibraryStage =
  | "discovery"
  | "load"
  | "validation"
  | "normalize"
  | "fallback"

export type LibraryFileError<TKey extends string = string> = {
  key: TKey
  path: string
  stage: LibraryStage
  /** Original error object (never stringified) */
  cause: unknown
  id: string
}

/** Discovery failed, or strict mode saw any file error. */
export type LibraryFatalError = {
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

export type LibraryResult<TValidated, TKey extends string> = {
  library: Map<TKey, TValidated>
  loading: boolean
  fatalError: LibraryFatalError | null
  fileErrors: Array<LibraryFileError<TKey>>
  reload: () => Promise<void>
  get: (key: TKey) => TValidated | undefined
  entries: () => Array<[TKey, TValidated]>
  items: () => Array<TValidated>
  keys: () => Array<TKey>
}

/**
 * Load a library of resources. Errors are returned as structured values,
 * never logged-only or summarized; a fallback fills the slot but its file's
 * error stays in `fileErrors`. `config` must be stable (loaded on mount).
 */
export function useRecursiveLibrary<
  TRaw,
  TValidated,
  TKey extends string = string,
>(
  config: LibraryConfig<TRaw, TValidated, TKey>
): LibraryResult<TValidated, TKey> {
  const [library, setLibrary] = useState<Map<TKey, TValidated>>(new Map())
  const [loading, setLoading] = useState(true)
  const [fatalError, setFatalError] = useState<LibraryFatalError | null>(null)
  const [fileErrors, setFileErrors] = useState<Array<LibraryFileError<TKey>>>(
    []
  )

  const load = async (): Promise<void> => {
    setLoading(true)
    setFatalError(null)
    setFileErrors([])

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

      setLibrary(nextLibrary)
      setFileErrors(nextFileErrors)
    } catch (err) {
      setFatalError({
        stage: "discovery",
        cause: err,
      })
      setLibrary(new Map())
      setFileErrors([])
    } finally {
      setLoading(false)
    }
  }

  // `load` sets `loading` synchronously so the first paint says "loading",
  // not "empty". Keyed to mount: `load` is redefined every render (it closes
  // over `config`, documented as stable).
  useEffect(() => {
    // Not awaited: `load` routes both outcomes into state and never rejects.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [])

  return {
    library,
    loading,
    fatalError,
    fileErrors,
    reload: load,
    get: (key: TKey) => library.get(key),
    entries: () => Array.from(library.entries()),
    items: () => Array.from(library.values()),
    keys: () => Array.from(library.keys()),
  }
}
