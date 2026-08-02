import type { ComponentType } from "react"
import { lazy } from "react"
import type { ComponentRegistry, RegistryEntry } from "@some-ui/types"

/** What `React.lazy` needs back, and what `preload` hands to a caller. */
type ComponentModule<P> = { default: ComponentType<P> }

/**
 * Overload 1: Default exports
 */
export function lazyWithPreload<P>(
  loader: () => Promise<ComponentModule<P>>
): RegistryEntry<P>

/**
 * Overload 2: Named exports
 *
 * `ComponentType<never>` in the module's value position rather than a real
 * prop type: the point is only that the module *has* components under its
 * keys, and naming a prop type here would make TypeScript try to unify every
 * export in the module into one. `never` props accept any component, which
 * is exactly the "don't look inside" this needs.
 */
export function lazyWithPreload<K extends string, P = unknown>(
  loader: () => Promise<Record<K, ComponentType<never>>>,
  exportName: K
): RegistryEntry<P>

/**
 * Implementation - one signature to rule them all.
 *
 * The loader is `unknown` rather than `any`: a dynamic `import()` resolved at
 * runtime is genuinely outside what the type system can check, and the honest
 * way to say so is to accept the widest type and *narrow it with a real
 * check*, rather than accept `any` and let unsoundness travel silently into
 * every caller.
 *
 * The single assertion below is where that narrowing runs out. A module
 * export is a value; whether it is a React component of prop type `P` is not
 * knowable here, and it is the same boundary `RegistryEntry` itself declares
 * in @some-ui/types. Everything reachable before it has been checked, and
 * each failure now says what was actually found instead of `undefined is not
 * a function` three frames later.
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

export function preloadRegistryComponents<K extends string>(
  registry: ComponentRegistry<K>,
  keys: Array<K>
): Promise<Array<void>> {
  return Promise.all(
    keys.map((key) => {
      const entry = registry[key]
      return entry.preload().then(() => {})
    })
  )
}
