import type { ActivityDefinition, ActivityId } from "@some-ui/activity-catalog"
import {
  ACTIVITY_CATALOG,
  ACTIVITY_IDS,
  isActivityId,
  resequence,
} from "@some-ui/activity-catalog"
import type { RegistryKey } from "@some-ui/content-registry"
import { componentRegistry } from "@some-ui/content-registry"
import type {
  ComponentRegistry,
  SceneConfig,
  UILayoutIntent,
} from "@some-ui/types"

import type { WebPanelKey } from "@/lib/web-surface"
import { WEB_PANELS } from "@/lib/web-surface"

/** Every panel identity this app knows, on any surface. */
export type PanelKey = RegistryKey | WebPanelKey

/**
 * Every panel this build binds: the ones both surfaces play, and the web
 * surface's own where the build has one (`@/lib/web-surface`). What the
 * session player renders, and what decides which activities a build offers.
 */
export const PANELS: ComponentRegistry<RegistryKey> &
  Partial<ComponentRegistry<WebPanelKey>> = {
  ...WEB_PANELS,
  ...componentRegistry,
}

const bound = (key: string): boolean => Object.hasOwn(PANELS, key)

/**
 * Whether this build offers `activity`: it does when it binds the panel the
 * activity's scenes render. So the Android app, which binds no web-only
 * panel, offers no web-only activity, and no list of them is kept anywhere.
 */
function offeredHere(activity: ActivityDefinition): boolean {
  return bound(activity.registryKey)
}

/**
 * The catalogue as this build offers it, in catalogue order: what the
 * launcher ranks and the composer's picker pages.
 */
export const OFFERED_ACTIVITIES: ReadonlyArray<ActivityDefinition> =
  ACTIVITY_IDS.map((id) => ACTIVITY_CATALOG[id]).filter(offeredHere)

/**
 * `isActivityId` for this build: an activity it does not offer reads as
 * retired, so a `?activity=` link to one opens an empty composer and editing
 * a session that holds one drops it, as a retired activity's would.
 */
export function isOfferedActivityId(value: unknown): value is ActivityId {
  return isActivityId(value) && offeredHere(ACTIVITY_CATALOG[value])
}

function boundPanels(layout: UILayoutIntent): UILayoutIntent {
  const panels = Object.entries(layout.panels ?? {})
  return panels.every(([, panel]) => bound(panel.registry_key))
    ? layout
    : {
        ...layout,
        panels: Object.fromEntries(
          panels.filter(([, panel]) => bound(panel.registry_key))
        ),
      }
}

/**
 * Stored scenes as this build plays them, for an edit of an Advanced
 * arrangement (whose scenes are saved as they are, not rebuilt from the
 * activities `isOfferedActivityId` keeps): panels it does not bind are
 * dropped, then any scene left with none, and the rest close up behind it.
 * The same array when nothing is dropped.
 */
export function playableScenes(
  scenes: ReadonlyArray<SceneConfig>
): ReadonlyArray<SceneConfig> {
  const kept = scenes
    .map((scene) => ({ ...scene, ui: scene.ui.map(boundPanels) }))
    .filter((scene) =>
      scene.ui.some((layout) => Object.keys(layout.panels ?? {}).length > 0)
    )
  const unchanged =
    kept.length === scenes.length &&
    kept.every((scene, i) =>
      scene.ui.every((layout, j) => layout === scenes[i]?.ui[j])
    )
  return unchanged ? scenes : resequence(kept)
}
