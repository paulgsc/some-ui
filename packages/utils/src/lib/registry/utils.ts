import type { ComponentType } from "react"
import { lazy } from "react"
import type { ComponentRegistry, RegistryEntry } from "some-types-utils"

/**
 * Overload 1: Default exports
 */
export function lazyWithPreload<P>(
  loader: () => Promise<{ default: ComponentType<P> }>
): RegistryEntry<P>

/**
 * Overload 2: Named exports
 * We use 'any' for the component in the Record to prevent TS from
 * trying to unify every export in the module into a single Prop type.
 */
export function lazyWithPreload<K extends string, P = any>(
  loader: () => Promise<Record<K, ComponentType<any>>>,
  exportName: K
): RegistryEntry<P>

/**
 * Implementation - One signature to rule them all
 */
export function lazyWithPreload<K extends string, P = any>(
  loader: () => Promise<any>,
  exportName?: K
): RegistryEntry<P> {
  const normalizedLoader = async (): Promise<{ default: ComponentType<P> }> => {
    const mod = await loader()

    if (exportName) {
      const Component = mod[exportName]
      if (!Component) {
        throw new Error(`Export "${exportName}" not found in module`)
      }
      return { default: Component }
    }

    return mod
  }

  return {
    Component: lazy(normalizedLoader),
    preload: normalizedLoader,
  }
}

export function preloadRegistryComponents<K extends string>(
  registry: ComponentRegistry<K>,
  keys: Array<K>
): Promise<Array<void>> {
  return Promise.all(
    keys.map((key) => {
      const entry = registry[key]
      // Use optional chaining to avoid "always truthy" linter errors
      return entry.preload().then(() => {}) ?? Promise.resolve()
    })
  )
}
