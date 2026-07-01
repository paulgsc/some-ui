import type { ComponentType, ReactNode } from "react"
import { Component, Suspense } from "react"
import type { ComponentRegistry } from "some-types-utils"

// Error Boundary
class ComponentErrorBoundary extends Component<
  { fallback?: ReactNode; children: ReactNode },
  { hasError: boolean; error?: Error }
> {
  state = { hasError: false, error: undefined }

  static getDerivedStateFromError(error: Error): {
    hasError: boolean
    error: Error
  } {
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

function assertIsValidProps(
  props: unknown
): asserts props is Record<string, unknown> {
  if (typeof props !== "object" || props === null || Array.isArray(props)) {
    throw new Error(
      `Invalid props provided to component: expected object, received ${typeof props}`
    )
  }
}

/**
 * Component enhancer - transforms a component into an enhanced version
 *
 * This is the key abstraction for dependency inversion:
 * - Renderer doesn't know about focus, analytics, theming, etc.
 * - Callers provide enhancers that inject whatever they need
 * - Composable and type-safe
 */
export type ComponentEnhancer<P = any> = (
  Component: ComponentType<P>
) => ComponentType<P>

/**
 * Registry render policy configuration
 *
 * Pure composition interface with no knowledge of:
 * - Focus system
 * - Region types
 * - Hooks
 * - Domain-specific concerns
 */
export type RegistryRenderPolicy = {
  withErrorBoundary?: boolean
  withSuspense?: boolean
  fallback?: ReactNode
  errorFallback?: ReactNode
  enhanceComponent?: ComponentEnhancer
}

const enhancedCache = new WeakMap<ComponentType<any>, ComponentType<any>>()

function getEnhanced<P>(
  Component: ComponentType<P>,
  enhance?: ComponentEnhancer<P>
): ComponentType<P> {
  if (!enhance) return Component

  const cached = enhancedCache.get(Component)
  if (cached) return cached

  const Enhanced = enhance(Component)
  enhancedCache.set(Component, Enhanced)
  return Enhanced
}

/**
 * Core registry component renderer
 *
 * Resolves a component from the registry and wraps it with
 * configurable policies (Suspense, Error Boundary, Enhancement)
 *
 * This is the single source of truth for registry-based rendering.
 * It is completely generic and unaware of:
 * - Focus system
 * - YouTube regions
 * - Any domain-specific features
 *
 * All domain concerns are injected via the `enhanceComponent` policy.
 */
export function renderRegistryComponent<K extends string>(
  registry: ComponentRegistry<K>,
  key: K,
  props: unknown,
  policy: RegistryRenderPolicy = {}
): ReactNode {
  const entry = registry[key]
  if (!entry) return null

  assertIsValidProps(props)

  let Component = entry.Component

  Component = getEnhanced(Component, policy.enhanceComponent)

  // Build component tree from inside out
  let node: ReactNode = <Component {...props} />

  // Wrap with Suspense if requested
  if (policy.withSuspense) {
    node = <Suspense fallback={policy.fallback ?? null}>{node}</Suspense>
  }

  // Wrap with Error Boundary if requested
  if (policy.withErrorBoundary) {
    node = (
      <ComponentErrorBoundary
        fallback={policy.errorFallback ?? policy.fallback}
      >
        {node}
      </ComponentErrorBoundary>
    )
  }

  return node
}
