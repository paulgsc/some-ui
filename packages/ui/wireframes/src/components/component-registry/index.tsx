import type { ComponentType, ReactNode } from "react"
import { Component, lazy, Suspense } from "react"
import { useRequestFocus } from "@wireframes/hooks/focus-system"
import type { YouTubeRegion } from "@wireframes/hooks/focus-system"
import type { ComponentRegistry, RegistryEntry } from "some-types-utils"

// Focus-capable component props
export type FocusCapableProps = {
  requestFocus?: (intensity: number, ttlMs?: number) => void
}

// Error Boundary
class ComponentErrorBoundary extends Component<
  { fallback?: ReactNode; children: ReactNode },
  { hasError: boolean; error?: Error }
> {
  state = { hasError: false, error: undefined }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: any): void {
    // eslint-disable-next-line no-console
    console.error("Component crashed:", error, errorInfo)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex items-center justify-center h-full text-red-500 text-sm">
            Component failed to load
          </div>
        )
      )
    }
    return this.props.children
  }
}

// Sandbox wrapper for focus-capable components
export function withFocusSandbox<P extends object>(
  Component: ComponentType<P>,
  region: YouTubeRegion
): ComponentType<P> {
  return function FocusSandboxed(props: P) {
    const requestFocus = useRequestFocus(region)

    return <Component {...props} requestFocus={requestFocus} />
  }
}

function assertIsValidProps(
  props: unknown
): asserts props is Record<string, unknown> {
  if (typeof props !== "object" || props === null || Array.isArray(props)) {
    throw new Error(
      `Invalid props provided to component: expected object, received ${typeof props}`
    )
  }
}

// Create registry component with lazy loading
export const createRegistryComponent = <T extends string>(
  registry: ComponentRegistry<T>,
  registryKey: T,
  props: unknown = {},
  fallback?: ReactNode,
  region?: YouTubeRegion
): ReactNode => {
  const entry = registry[registryKey]
  assertIsValidProps(props)

  const { Component } = entry
  const WrappedComponent = region
    ? withFocusSandbox(Component, region)
    : Component

  return (
    <ComponentErrorBoundary
      fallback={
        <div className="flex items-center justify-center h-full text-red-500 text-sm">
          Failed to load {registryKey}
        </div>
      }
    >
      <Suspense fallback={fallback ?? <div>Loading...</div>}>
        <WrappedComponent {...props} />
      </Suspense>
    </ComponentErrorBoundary>
  )
}

// Lazy component factory with preload
export function lazyWithPreload<K extends string, P>(
  loader: () => Promise<Record<K, ComponentType<P>>>,
  exportName: K
): RegistryEntry<P> {
  const normalizedLoader = async (): Promise<{ default: ComponentType<P> }> => {
    const mod = await loader()
    return { default: mod[exportName] }
  }

  return {
    Component: lazy(normalizedLoader),
    preload: normalizedLoader,
  }
}

// Preload multiple components
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
