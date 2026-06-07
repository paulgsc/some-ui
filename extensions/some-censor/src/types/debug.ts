export type BoyoDebugSnapshot = {
  /** Monotonic counter — increments on every publish() call. */
  readonly tick: number

  /** VideoManager phase */
  readonly phase: "idle" | "running"

  /** Number of fully resolved, mounted video entries */
  readonly mounted: number

  /** Number of elements in the unresolved retry queue */
  readonly unresolved: number

  /** Per-video FSM state — keyed by videoId */
  readonly entries: ReadonlyMap<string, EntryDebugInfo>

  /** Timestamp of last mutation batch processed by the observer */
  readonly lastMutationMs: number | null

  /** Number of yt-navigate-finish events received this session */
  readonly navigations: number

  /** Current session counter value (opaque but comparable) */
  readonly sessionOrdinal: number
}

export type BoyoDebugSnapshotWire = {
  /** Monotonic counter — increments on every publish() call. */
  readonly tick: number

  /** VideoManager phase */
  readonly phase: "idle" | "running"

  /** Number of fully resolved, mounted video entries */
  readonly mounted: number

  /** Number of elements in the unresolved retry queue */
  readonly unresolved: number

  /** Per-video FSM state — keyed by videoId */
  readonly entries: Record<string, EntryDebugInfo>

  /** Timestamp of last mutation batch processed by the observer */
  readonly lastMutationMs: number | null

  /** Number of yt-navigate-finish events received this session */
  readonly navigations: number

  /** Current session counter value (opaque but comparable) */
  readonly sessionOrdinal: number
}

export type EntryDebugInfo = {
  readonly videoId: string
  readonly channelId: string
  readonly viewKind: "masked" | "meta" | "title" | "revealed" | "whitelisted"
  readonly isConnected: boolean
}
