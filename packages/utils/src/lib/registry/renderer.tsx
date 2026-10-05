import type { ComponentType, ReactNode } from "react"
import { Component, Suspense } from "react"
import type { ComponentRegistry } from "@some-ui/types"

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

  componentDidCatch(error: Error, errorInfo: unknown): void {
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
 * Wraps a component with whatever a caller needs (focus, analytics,
 * theming), so the renderer itself knows none of those.
 */
export type ComponentEnhancer<P extends object = Record<string, unknown>> = (
  Component: ComponentType<P>
) => ComponentType<P>

export type RegistryRenderPolicy = {
  withErrorBoundary?: boolean
  withSuspense?: boolean
  fallback?: ReactNode
  errorFallback?: ReactNode
  enhanceComponent?: ComponentEnhancer
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const enhancedCache = new WeakMap<ComponentType<any>, ComponentType<any>>()

function getEnhanced<P extends object>(
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
 * The single registry renderer: resolves `key` and wraps it in the policy's
 * Suspense, error boundary and enhancer. Domain concerns arrive only through
 * `enhanceComponent`.
 */
export function renderRegistryComponent<K extends string>(
  registry: ComponentRegistry<K>,
  key: K,
  props: unknown,
  policy: RegistryRenderPolicy = {}
): ReactNode {
  // A saved session can name a panel the registry no longer has. It renders
  // through the fallback rather than throwing before any boundary exists.
  if (!Object.hasOwn(registry, key)) {
    return policy.errorFallback ?? policy.fallback ?? null
  }
  const entry = registry[key]

  assertIsValidProps(props)

  let Component = entry.Component

  Component = getEnhanced(Component, policy.enhanceComponent)

  let node: ReactNode = <Component {...props} />

  if (policy.withSuspense) {
    node = <Suspense fallback={policy.fallback ?? null}>{node}</Suspense>
  }

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
