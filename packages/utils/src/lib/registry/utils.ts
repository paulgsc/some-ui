import type { ComponentType } from "react"
import { lazy } from "react"
import type { ComponentRegistry, RegistryEntry } from "some-types-utils"

/**
 * Lazy component factory with preload capability
 *
 * Wraps a dynamic import to work with both React.lazy and manual preloading.
 * Supports both default exports and named exports.
 */
export function lazyWithPreload<P>(
  loader: () => Promise<{ default: ComponentType<P> }>
): RegistryEntry<P>

export function lazyWithPreload<K extends string, P = unknown>(
  loader: () => Promise<Record<K, ComponentType<P>>>,
  exportName: K
): RegistryEntry<P>

export function lazyWithPreload<K extends string, P = unknown>(
  loader: () => Promise<any>,
  exportName?: K
): RegistryEntry<P> {
  const normalizedLoader = async (): Promise<{ default: ComponentType<P> }> => {
    const mod = await loader()

    // If exportName is provided, use the named export
    // Otherwise, use the default export
    if (exportName) {
      return { default: mod[exportName] }
    }

    return mod
  }

  return {
    Component: lazy(normalizedLoader),
    preload: normalizedLoader,
  }
}

/**
 * Preload multiple components from a registry
 *
 * Useful for warming up components before they're needed
 */
export function preloadRegistryComponents<K extends string>(
  registry: ComponentRegistry<K>,
  keys: Array<K>
): Promise<Array<void>> {
  return Promise.all(
    keys.map((key) => {
      const entry = registry[key]
      if (entry.preload) {
        return entry.preload().then(() => {})
      }
      // eslint-disable-next-line no-console
      console.warn(`Cannot preload "${key}" - not found in registry`)
      return Promise.resolve()
    })
  )
}
