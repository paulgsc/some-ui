/**
 * The app events' lane (CK2, #2381; LA15): what this phone saw happen as it
 * ran (`@/lib/app-events`), drained to home by `./app-events-send` through
 * the one wiring (`./lanes`). The lane has no wing mark: Settings' readout
 * says where the events are kept.
 */
import { useSyncExternalStore } from "react"

import {
  appEventsRevision,
  appEventsWaiting,
  subscribeAppEvents,
} from "@/lib/app-events"

import { exchangeAppEvents } from "./app-events-send"
import type { Lane, LaneCounts } from "./lanes"

const waitingCount = (): number => appEventsWaiting().length

export const appEventsLane: Lane = {
  id: "app-events",
  exchange: (send) => exchangeAppEvents(send),
  revision: appEventsRevision,
  subscribe: subscribeAppEvents,
  useCounts: (): LaneCounts => ({
    held: {},
    refused: {},
    waiting: useSyncExternalStore(subscribeAppEvents, waitingCount),
    hidden: 0,
    pulled: true,
  }),
}
