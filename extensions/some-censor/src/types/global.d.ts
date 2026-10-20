import type { BoyoDebugSnapshotWire } from "@censor/types/debug"

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Window {
    __BOYO_DEBUG__?: BoyoDebugSnapshotWire
  }
}

export {}
