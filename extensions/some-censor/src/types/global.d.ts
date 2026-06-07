import type { BoyoDebugSnapshotWire } from "@censor/types/debug"

declare global {
  interface Window {
    __BOYO_DEBUG__?: BoyoDebugSnapshotWire
  }
}

export {}
