import type { ComponentType } from "react"
import { lazy } from "react"
import type { RegistryEntry } from "@some-ui/types"

/** What `React.lazy` needs back, and what `preload` hands to a caller. */
type ComponentModule<P> = { default: ComponentType<P> }

export function lazyWithPreload<P>(
  loader: () => Promise<ComponentModule<P>>
): RegistryEntry<P>

/**
 * Named export. `ComponentType<never>` accepts any component; a real prop
 * type would make TypeScript unify every export in the module into one.
 */
export function lazyWithPreload<K extends string, P = unknown>(
  loader: () => Promise<Record<K, ComponentType<never>>>,
  exportName: K
): RegistryEntry<P>

/**
 * The loader is `unknown`, narrowed by real checks so each failure says what
 * was found. The one assertion is where narrowing runs out: whether an export
 * is a component of props `P` is unknowable here (the same boundary
 * `RegistryEntry` declares in @some-ui/types).
 */

export function lazyWithPreload<K extends string, P = unknown>(
  loader: () => Promise<unknown>,
  exportName?: K
): RegistryEntry<P> {
  const normalizedLoader = async (): Promise<ComponentModule<P>> => {
    const mod: unknown = await loader()

    if (typeof mod !== "object" || mod === null) {
      throw new Error(
        `Module loader resolved to ${typeof mod}, not a module object`
      )
    }

    const key = exportName ?? "default"
    if (!(key in mod)) {
      throw new Error(`Export "${key}" not found in module`)
    }

    const exported: unknown = Reflect.get(mod, key)
    if (typeof exported !== "function" && typeof exported !== "object") {
      throw new Error(
        `Export "${key}" is a ${typeof exported}, not a component`
      )
    }

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the boundary described above
    return { default: exported as ComponentType<P> }
  }

  return {
    Component: lazy(normalizedLoader),
    preload: normalizedLoader,
  }
}
