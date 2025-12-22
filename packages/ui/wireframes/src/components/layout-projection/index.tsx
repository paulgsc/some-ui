import { useMemo } from "react"
import type { ReactNode } from "react"
import { withFocus } from "@wireframes/components/focus-enhancer"
import type { ResolvedFocus } from "@wireframes/hooks/focus-system"
import type {
  ComponentRegistry,
  UILayoutIntent,
  YouTubeRegion,
} from "some-types-utils"
import { renderRegistryComponent } from "some-ui-utils"

// Content map type
export type RegionContentMap = Partial<Record<YouTubeRegion, ReactNode>>

/**
 * Resolve content from UI intent using registry
 *
 * Maps region placements to rendered components with full policy:
 * - Suspense + Error Boundary for robustness
 * - Focus injection per region via enhancer (dependency inversion)
 *
 * Note: Focus injection happens via withFocus enhancer, not by passing
 * region directly to renderer. This keeps the renderer generic.
 */
export function resolveContentFromIntent<K extends string>(
  intent: UILayoutIntent | undefined,
  registry: ComponentRegistry<K>
): RegionContentMap {
  if (!intent || !intent.panels) return {}

  const content: RegionContentMap = {}

  for (const [region, placement] of Object.entries(intent.panels)) {
    const youtubeRegion = region as YouTubeRegion

    content[youtubeRegion] = renderRegistryComponent(
      registry,
      placement.registryKey as K,
      placement.props ?? {},
      {
        withSuspense: true,
        withErrorBoundary: true,
        fallback: <div>Loading...</div>,
        errorFallback: (
          <div className="flex items-center justify-center h-full text-red-500 text-sm">
            Failed to load {placement.registryKey}
          </div>
        ),
        // Dependency inversion: inject focus via enhancer
        enhanceComponent: withFocus(youtubeRegion),
      }
    )
  }

  return content
}

/**
 * Hook: Resolve content from UI intent
 *
 * Memoizes content resolution based on intent.content changes
 */
export function useResolvedContent<K extends string>(
  intent: UILayoutIntent | undefined,
  registry: ComponentRegistry<K>
): RegionContentMap {
  return useMemo(
    () => resolveContentFromIntent(intent, registry),
    [intent, registry]
  )
}

/**
 * Hook: Resolve focus constraints from focus state
 *
 * Extracts focus region and intensity for layout solver
 */
export function useResolvedFocusConstraints(focus: ResolvedFocus) {
  return useMemo(
    () => ({
      focusRegion: focus?.region ?? null,
      focusIntensity: focus?.intensity ?? 0,
    }),
    [focus]
  )
}

/**
 * Layout projection state
 *
 * Complete view of what should be rendered and how it should be focused
 */
export type LayoutProjection = {
  content: RegionContentMap
  focusRegion: YouTubeRegion | null
  focusIntensity: number
}

/**
 * Complete projection from intent + resolved focus
 *
 * Combines content resolution and focus state into a single projection
 */
export function projectLayout<K extends string>(
  intent: UILayoutIntent,
  resolvedFocus: ResolvedFocus,
  registry: ComponentRegistry<K>
): LayoutProjection {
  return {
    content: resolveContentFromIntent(intent, registry),
    focusRegion: resolvedFocus?.region ?? null,
    focusIntensity: resolvedFocus?.intensity ?? 0,
  }
}
