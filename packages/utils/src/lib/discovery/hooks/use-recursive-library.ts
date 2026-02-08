/**
 * Generic Recursive Library Engine
 * Abstract over (S, P, E) where:
 * - P = root path
 * - E = extension
 * - S = discovered file set (runtime)
 *
 * Generic over:
 * - TRaw: raw file format
 * - TValidated: normalized domain type
 * - TKey: key type for library indexing
 */

import { useEffect, useState } from "react"
import type { FileDiscovery, ResourceLoader } from "@utils/lib/discovery"
import type { ZodSchema } from "zod"

export type LibraryConfig<TRaw, TValidated, TKey extends string = string> = {
  /** Root path to search for files */
  rootPath: string

  /** File extension to filter by */
  extension: string

  /** Discovery strategy */
  discovery: FileDiscovery

  /** Loading strategy */
  loader: ResourceLoader

  /** Zod schema for raw file validation */
  rawSchema: ZodSchema<TRaw>

  /** Transform raw data into domain model */
  normalize: (key: TKey, raw: TRaw) => TValidated

  /** Optional fallback for failed loads */
  fallback?: (key: TKey) => TValidated

  /** Derive library key from file path */
  deriveKey: (fullPath: string) => TKey
}

export type LibraryResult<TValidated, TKey extends string> = {
  /** The loaded library as a map */
  library: Map<TKey, TValidated>

  /** Loading state */
  loading: boolean

  /** Error message if load failed */
  error: string | null

  /** Reload the entire library */
  reload: () => Promise<void>

  /** Get a single item by key */
  get: (key: TKey) => TValidated | undefined

  /** Get all entries as array */
  entries: () => Array<[TKey, TValidated]>

  /** Get all items as array */
  items: () => Array<TValidated>

  /** Get all keys as array */
  keys: () => Array<TKey>
}

export function useRecursiveLibrary<
  TRaw,
  TValidated,
  TKey extends string = string,
>(
  config: LibraryConfig<TRaw, TValidated, TKey>
): LibraryResult<TValidated, TKey> {
  const [library, setLibrary] = useState<Map<TKey, TValidated>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      // Step 1: Discover files
      const files = await config.discovery.listFiles(
        config.rootPath,
        config.extension
      )

      const nextLibrary = new Map<TKey, TValidated>()
      const errors: Array<{ key: TKey; error: unknown }> = []

      // Step 2: Load and validate each file
      await Promise.all(
        files.map(async (filePath) => {
          const key = config.deriveKey(filePath)

          try {
            // Load raw data
            const rawUnknown = await config.loader.load(filePath)

            // Validate with Zod
            const raw = config.rawSchema.parse(rawUnknown)

            // Normalize to domain model
            const normalized = config.normalize(key, raw)

            nextLibrary.set(key, normalized)

            // eslint-disable-next-line no-console
            console.log(`[RecursiveLibrary] Loaded: ${key}`)
          } catch (err) {
            errors.push({ key, error: err })

            // Use fallback if available
            if (config.fallback) {
              const fallback = config.fallback(key)
              nextLibrary.set(key, fallback)
              // eslint-disable-next-line no-console
              console.warn(`[RecursiveLibrary] Using fallback for ${key}:`, err)
            } else {
              // eslint-disable-next-line no-console
              console.error(`[RecursiveLibrary] Failed to load ${key}:`, err)
            }
          }
        })
      )

      setLibrary(nextLibrary)

      // Report errors if some files failed without fallback
      if (errors.length > 0 && !config.fallback) {
        setError(`Failed to load ${errors.length} file(s)`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      setError(`Library load failed: ${message}`)
      // eslint-disable-next-line no-console
      console.error("[RecursiveLibrary] Fatal error:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return {
    library,
    loading,
    error,
    reload: load,
    get: (key: TKey) => library.get(key),
    entries: () => Array.from(library.entries()),
    items: () => Array.from(library.values()),
    keys: () => Array.from(library.keys()),
  }
}
