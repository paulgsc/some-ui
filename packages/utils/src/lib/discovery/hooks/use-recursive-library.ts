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
 *
 * DESIGN PRINCIPLE: Zero signal loss - all errors are preserved and traceable
 */

import { useEffect, useState } from "react"
import type { ZodSchema } from "zod"

import type { FileDiscovery, ResourceLoader } from ".."

/**
 * Error stage taxonomy - every error is tagged with its origin
 */
export type LibraryStage =
  | "discovery" // Failed to list files
  | "load" // Failed to read file contents
  | "validation" // Failed Zod schema validation
  | "normalize" // Failed domain transformation
  | "fallback" // Failed to generate fallback value

/**
 * Per-file error with full diagnostic context
 * Never collapsed or summarized - preserves original cause
 */
export type LibraryFileError<TKey extends string = string> = {
  /** Library key that failed */
  key: TKey

  /** Full file path */
  path: string

  /** Stage where failure occurred */
  stage: LibraryStage

  /** Original error object (never stringified) */
  cause: unknown

  /** Deterministic error ID for debugging */
  id: string
}

/**
 * Fatal error that prevents library from loading at all
 */
export type LibraryFatalError = {
  stage: "discovery"
  cause: unknown
}

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

  /** Optional fallback for failed loads (does NOT hide errors) */
  fallback?: (key: TKey) => TValidated

  /** Derive library key from file path */
  deriveKey: (fullPath: string) => TKey

  /** Strict mode: fail entire library if any file fails (default: false) */
  strict?: boolean
}

export type LibraryResult<TValidated, TKey extends string> = {
  /** The loaded library as a map */
  library: Map<TKey, TValidated>

  /** Loading state */
  loading: boolean

  /** Fatal error that prevented library creation */
  fatalError: LibraryFatalError | null

  /** All per-file errors (never collapsed or summarized) */
  fileErrors: Array<LibraryFileError<TKey>>

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

/**
 * Hook: Load a library of resources with full error traceability
 *
 * Error Handling Philosophy:
 * - No silent failures
 * - No error collapsing (string summaries)
 * - No console-only logging
 * - Structured errors always returned to caller
 * - Fallbacks augment state but don't hide failures
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
      // ═══════════════════════════════════════════════════════════════
      // STAGE 1: DISCOVERY
      // ═══════════════════════════════════════════════════════════════
      const files = await config.discovery.listFiles(
        config.rootPath,
        config.extension
      )

      const nextLibrary = new Map<TKey, TValidated>()
      const nextFileErrors: Array<LibraryFileError<TKey>> = []

      // ═══════════════════════════════════════════════════════════════
      // STAGE 2: PROCESS FILES (parallel with explicit error capture)
      // ═══════════════════════════════════════════════════════════════
      await Promise.all(
        files.map(async (filePath) => {
          const key = config.deriveKey(filePath)

          // ───────────────────────────────────────────────────────────
          // STAGE 2.1: LOAD
          // ───────────────────────────────────────────────────────────
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
            return // Early exit - can't proceed without file contents
          }

          // ───────────────────────────────────────────────────────────
          // STAGE 2.2: VALIDATION (using safeParse to preserve ZodError)
          // ───────────────────────────────────────────────────────────
          const parsed = config.rawSchema.safeParse(rawUnknown)
          if (!parsed.success) {
            nextFileErrors.push({
              key,
              path: filePath,
              stage: "validation",
              cause: parsed.error, // Full ZodError object preserved
              id: `validation:${filePath}`,
            })
            return // Early exit - can't normalize invalid data
          }

          // ───────────────────────────────────────────────────────────
          // STAGE 2.3: NORMALIZATION
          // ───────────────────────────────────────────────────────────
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
            // Note: Don't return - we may still want to try fallback
          }
        })
      )

      // ═══════════════════════════════════════════════════════════════
      // STAGE 3: FALLBACK HANDLING (augments but doesn't hide errors)
      // ═══════════════════════════════════════════════════════════════
      if (config.fallback) {
        for (const error of nextFileErrors) {
          // Only apply fallback if the key isn't already in library
          if (!nextLibrary.has(error.key)) {
            try {
              const fallback = config.fallback(error.key)
              nextLibrary.set(error.key, fallback)
              // Note: Original error remains in nextFileErrors
            } catch (fallbackErr) {
              // Fallback itself failed - record this as additional error
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

      // ═══════════════════════════════════════════════════════════════
      // STAGE 4: STRICT MODE CHECK
      // ═══════════════════════════════════════════════════════════════
      if (config.strict && nextFileErrors.length > 0) {
        // In strict mode, any file error is fatal
        throw new Error(
          `Strict mode: ${nextFileErrors.length} file(s) failed to load. ` +
            `Keys: ${nextFileErrors.map((e) => e.key).join(", ")}`
        )
      }

      // ═══════════════════════════════════════════════════════════════
      // STAGE 5: COMMIT STATE
      // ═══════════════════════════════════════════════════════════════
      setLibrary(nextLibrary)
      setFileErrors(nextFileErrors)
    } catch (err) {
      // Fatal error during discovery or strict mode violation
      setFatalError({
        stage: "discovery",
        cause: err,
      })
      // In fatal error case, clear library and file errors
      setLibrary(new Map())
      setFileErrors([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, []) // Note: Dependencies intentionally minimal - config is expected to be stable

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

/**
 * Utility: Format error for display/logging
 * Use this to convert structured errors to human-readable strings when needed
 */
export function formatLibraryError<TKey extends string>(
  error: LibraryFileError<TKey>
): string {
  const causeMessage =
    error.cause instanceof Error ? error.cause.message : String(error.cause)

  return `[${error.stage}] ${error.key} (${error.path}): ${causeMessage}`
}

/**
 * Utility: Check if library has any errors
 */
export function hasErrors<TValidated, TKey extends string>(
  result: LibraryResult<TValidated, TKey>
): boolean {
  return result.fatalError !== null || result.fileErrors.length > 0
}

/**
 * Utility: Get all error messages as array
 */
export function getAllErrorMessages<TValidated, TKey extends string>(
  result: LibraryResult<TValidated, TKey>
): Array<string> {
  const messages: Array<string> = []

  if (result.fatalError) {
    const cause =
      result.fatalError.cause instanceof Error
        ? result.fatalError.cause.message
        : String(result.fatalError.cause)
    messages.push(`[FATAL] ${cause}`)
  }

  messages.push(...result.fileErrors.map(formatLibraryError))

  return messages
}
