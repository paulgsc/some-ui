import type { ActiveLifetime, SlotId } from "@some-ui/types"

import { getActivityByRegistryKey } from "@some-ui/activity-catalog"

type MinimalUiLayer = { panels?: Record<string, { registry_key: string }> }

/** Translates a scene's registry_key into its Activity Catalog friendly name. */
export function friendlyActivityName(
  sceneName: string,
  ui: ReadonlyArray<MinimalUiLayer> | undefined
): string {
  const registryKey = ui?.[0]?.panels?.mainContent?.registry_key
  if (!registryKey) return sceneName
  return getActivityByRegistryKey(registryKey)?.name ?? sceneName
}

/** Every leaf id with a registry component bound to it, across all active scenes. */
export function boundLeafIdsOf(
  activeLifetimes: ReadonlyArray<ActiveLifetime>
): Set<SlotId> {
  const ids = new Set<SlotId>()
  for (const lifetime of activeLifetimes) {
    for (const layer of lifetime.kind.Scene.ui ?? []) {
      for (const leafId of Object.keys(layer.panels ?? {})) {
        ids.add(leafId)
      }
    }
  }
  return ids
}
