import { useMemo } from "react"
import type { ReactNode } from "react"
import { createRegistryComponent } from "@wireframes/components/component-registry"
import type {
  ResolvedFocus,
  YouTubeRegion,
} from "@wireframes/hooks/focus-system"
import type { ComponentRegistry, UILayoutIntent } from "some-types-utils"

// Content map type
export type RegionContentMap = Partial<Record<YouTubeRegion, ReactNode>>

// Resolve content from intent + registry
export function resolveContentFromIntent<K extends string>(
  intent: UILayoutIntent,
  registry: ComponentRegistry<K>
): RegionContentMap {
  if (!intent.content) return {}

  const content: RegionContentMap = {}

  for (const [region, placement] of Object.entries(intent.content)) {
    content[region as YouTubeRegion] = createRegistryComponent(
      registry,
      placement.registryKey as K,
      placement.props ?? {},
      undefined,
      region as YouTubeRegion
    )
  }

  return content
}

// Hook: Resolve content from UI intent
export function useResolvedContent<K extends string>(
  intent: UILayoutIntent,
  registry: ComponentRegistry<K>
): RegionContentMap {
  return useMemo(
    () => resolveContentFromIntent(intent, registry),
    [intent.content, registry]
  )
}

// Hook: Resolve focus constraints from focus state
export function useResolvedFocusConstraints(focus: ResolvedFocus) {
  return useMemo(
    () => ({
      focusRegion: focus?.region ?? null,
      focusIntensity: focus?.intensity ?? 0,
    }),
    [focus]
  )
}

// Layout projection state
export type LayoutProjection = {
  content: RegionContentMap
  focusRegion: YouTubeRegion | null
  focusIntensity: number
}

// Complete projection from intent + resolved focus
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
