import type { ComponentType, JSX } from "react"
import type { SlotId } from "@some-ui/types"
import { useRequestFocus } from "@wireframes/hooks/focus-system"
import type { ComponentEnhancer } from "some-ui-utils"

/** Props of a component that accepts focus injection. */
export type FocusCapableProps = {
  requestFocus?: (intensity: number, ttlMs?: number) => void
}

/**
 * An enhancer that injects `requestFocus` for `region`, so the registry
 * renderer never knows about focus:
 * ```ts
 * renderRegistryComponent(registry, key, props, {
 *   enhanceComponent: withFocus('video')
 * })
 * ```
 */
export function withFocus<P extends object>(
  region: SlotId
): ComponentEnhancer<P & FocusCapableProps> {
  return (Component: ComponentType<P & FocusCapableProps>) => {
    const FocusWrapped = (props: P): JSX.Element => {
      const requestFocus = useRequestFocus(region)
      return <Component {...props} requestFocus={requestFocus} />
    }

    FocusWrapped.displayName = `withFocus(${String(region)})(${
      Component.displayName || Component.name || "Component"
    })`

    return FocusWrapped
  }
}
