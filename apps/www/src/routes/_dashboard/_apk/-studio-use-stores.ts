/**
 * Studio's ideas and videos, for what uses each take (INUSE,
 * `lib/take-uses`): the one hand-in, which Studio's layout (`./journal.tsx`)
 * and My data's kind route (`./settings/data/$kind.tsx`) each call when
 * they load, before any page under them asks, so a sheet opened from
 * `?note=` reads them; the first hand-in stands. It lives under `_apk/`,
 * the only place that may load Studio's package (`build.profiles.ts`'s
 * gates), and its `-` keeps it out of the route tree.
 */
import {
  IDEAS_KEY,
  keptIdeaStore,
  phoneProjectStore,
} from "@some-ui/soundbites"

import { keepUseStores, keptWhole } from "@/lib/take-uses"

/** Hands Studio's stores to `lib/take-uses`; a later call changes nothing. */
export function keepStudioUseStores(): void {
  keepUseStores({
    ideas: () => keptWhole(IDEAS_KEY, () => keptIdeaStore().list()),
    videos: () => phoneProjectStore().listWhole(),
    subscribe: (listener) => phoneProjectStore().subscribe(listener),
  })
}
