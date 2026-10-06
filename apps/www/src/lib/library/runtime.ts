/**
 * Loads every `extension` file under `rootPath` into a keyed library:
 * raw file (`TRaw`) -> validated domain value (`TValidated`), keyed by `TKey`.
 * Every error is preserved and traceable, never collapsed: a fallback fills
 * the slot but its file's error stays in `fileErrors`.
 *
 * The runtime owns the async work (R1, docs/monorepo-boundaries.md): it
 * publishes snapshots, and a load that a newer one superseded is dropped, so a
 * late result never lands over a newer one. `useRecursiveLibrary` only
 * subscribes.
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

export type LibrarySnapshot<TValidated, TKey extends string> = {
  library: Map<TKey, TValidated>
  loading: boolean
  fatalError: LibraryFatalError | null
  fileErrors: Array<LibraryFileError<TKey>>
}

export type LibraryRuntime<TValidated, TKey extends string> = {
  getSnapshot: () => LibrarySnapshot<TValidated, TKey>
  subscribe: (listener: () => void) => () => void
  /** Starts a load; resolves once its result is published or superseded. Never rejects. */
  load: () => Promise<void>
}

type LoadOutcome<TValidated, TKey extends string> =
  | {
      kind: "loaded"
      library: Map<TKey, TValidated>
      fileErrors: Array<LibraryFileError<TKey>>
    }
  | { kind: "fatal"; error: LibraryFatalError }

async function loadLibrary<TRaw, TValidated, TKey extends string>(
  config: LibraryConfig<TRaw, TValidated, TKey>
): Promise<LoadOutcome<TValidated, TKey>> {
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

export function createLibraryRuntime<
  TRaw,
  TValidated,
  TKey extends string = string,
>(
  config: LibraryConfig<TRaw, TValidated, TKey>
): LibraryRuntime<TValidated, TKey> {
  let snapshot: LibrarySnapshot<TValidated, TKey> = {
    library: new Map(),
    loading: true,
    fatalError: null,
    fileErrors: [],
  }
  const listeners = new Set<() => void>()
  let generation = 0

  const publish = (next: LibrarySnapshot<TValidated, TKey>): void => {
    snapshot = next
    for (const listener of listeners) listener()
  }

  return {
    getSnapshot: (): LibrarySnapshot<TValidated, TKey> => snapshot,
    subscribe: (listener): (() => void) => {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    load: async (): Promise<void> => {
      generation += 1
      const mine = generation
      publish({ ...snapshot, loading: true, fatalError: null, fileErrors: [] })
      const outcome = await loadLibrary(config)
      if (mine !== generation) return
      publish(
        outcome.kind === "loaded"
          ? {
              library: outcome.library,
              loading: false,
              fatalError: null,
              fileErrors: outcome.fileErrors,
            }
          : {
              library: new Map(),
              loading: false,
              fatalError: outcome.error,
              fileErrors: [],
            }
      )
    },
  }
}
