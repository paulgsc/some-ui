import { useEffect, useState, useSyncExternalStore } from "react"

import type { LibraryConfig, LibrarySnapshot } from "@/lib/library/runtime"
import { createLibraryRuntime } from "@/lib/library/runtime"

export type LibraryResult<TValidated, TKey extends string> = LibrarySnapshot<
  TValidated,
  TKey
> & {
  reload: () => Promise<void>
  get: (key: TKey) => TValidated | undefined
  entries: () => Array<[TKey, TValidated]>
  items: () => Array<TValidated>
  keys: () => Array<TKey>
}

/**
 * Load a library of resources (see `@/lib/library/runtime`). Errors are
 * returned as structured values, never logged-only or summarized. `config`
 * must be stable: it is read once, when the runtime is made on mount.
 */
export function useRecursiveLibrary<
  TRaw,
  TValidated,
  TKey extends string = string,
>(
  config: LibraryConfig<TRaw, TValidated, TKey>
): LibraryResult<TValidated, TKey> {
  // eslint-disable-next-line owner-guard/no-mount-snapshot -- a runtime made once per mount; config is documented as stable
  const [runtime] = useState(() => createLibraryRuntime(config))
  const { library, loading, fatalError, fileErrors } = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot
  )

  useEffect(() => {
    // The runtime publishes both outcomes and never rejects.
    void runtime.load()
  }, [runtime])

  return {
    library,
    loading,
    fatalError,
    fileErrors,
    reload: runtime.load,
    get: (key: TKey) => library.get(key),
    entries: () => Array.from(library.entries()),
    items: () => Array.from(library.values()),
    keys: () => Array.from(library.keys()),
  }
}
