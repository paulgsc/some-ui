import type { ActivityDefinition, ActivityId } from "@some-ui/activity-catalog"
import {
  ACTIVITY_CATALOG,
  ACTIVITY_IDS,
  isActivityId,
} from "@some-ui/activity-catalog"
import type { RegistryKey } from "@some-ui/content-registry"
import { componentRegistry } from "@some-ui/content-registry"
import type { ComponentRegistry } from "@some-ui/types"

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

/**
 * Whether this build offers `activity`: it does when it binds the panel the
 * activity's scenes render. So the Android app, which binds no web-only
 * panel, offers no web-only activity, and no list of them is kept anywhere.
 */
function offeredHere(activity: ActivityDefinition): boolean {
  return Object.hasOwn(PANELS, activity.registryKey)
}

/**
 * The catalogue as this build offers it, in catalogue order: what the
 * launcher ranks and the composer's picker pages.
 */
export const OFFERED_ACTIVITIES: ReadonlyArray<ActivityDefinition> =
  ACTIVITY_IDS.map((id) => ACTIVITY_CATALOG[id]).filter(offeredHere)

/**
 * `isActivityId` for this build: an activity it does not offer reads as
 * retired, so a `?activity=` link to one opens an empty composer.
 */
export function isOfferedActivityId(value: unknown): value is ActivityId {
  return isActivityId(value) && offeredHere(ACTIVITY_CATALOG[value])
}
