import type { ComponentType, JSX } from "react"
import { useRequestFocus } from "@wireframes/hooks/focus-system"
import type { SlotId } from "some-types-utils"
import type { ComponentEnhancer } from "some-ui-utils"

/**
 * Focus-capable component props
 *
 * Components that support focus injection should accept this prop
 */
export type FocusCapableProps = {
  requestFocus?: (intensity: number, ttlMs?: number) => void
}

/**
 * Focus component enhancer factory
 *
 * Creates an enhancer that injects focus capabilities into components.
 * This is where the focus-system meets the registry renderer via
 * dependency inversion - the renderer doesn't know about focus,
 * but callers can inject it via this enhancer.
 *
 * Usage:
 * ```ts
 * renderRegistryComponent(registry, key, props, {
 *   enhanceComponent: withFocus('video')
 * })
 * ```
 *
 * @param region - The slot id this component is bound to
 * @returns Component enhancer that injects requestFocus prop
 */
export function withFocus<P extends object>(
  region: SlotId
): ComponentEnhancer<P & FocusCapableProps> {
  return (Component: ComponentType<P & FocusCapableProps>) => {
    const FocusWrapped = (props: P): JSX.Element => {
      const requestFocus = useRequestFocus(region)
      return <Component {...props} requestFocus={requestFocus} />
    }

    // Preserve display name for debugging
    FocusWrapped.displayName = `withFocus(${String(region)})(${
      Component.displayName || Component.name || "Component"
    })`

    return FocusWrapped
  }
}
