/**
 * What uses each take, read over ports (INUSE, C1360): every source read
 * afresh on each `read`, one this phone can't read answering `unread`
 * (TU1, `./model`); never rejects. A list's badges read `snapshot`, which
 * a screen's open, a Studio write and `refresh` read again, a read
 * overtaken by a newer one dropped. The delete sheet reads afresh at open
 * and again at its delete (`lib/my-data/deleting-runtime`), so a badge a
 * list still shows from before is never what a delete goes on.
 */
import type { WeekSent } from "@some-ui/rust-rounds"

import type { InterviewSent } from "@/lib/interview-week/spec"
import type { SpokenCard } from "@/lib/studio-spoken/model"

import type {
  HomeSaid,
  Read,
  TakeUse,
  TakeUses,
  UseIdea,
  UseSource,
  UseSources,
  UseVideo,
} from "./model"
import { ALL_UNREAD, homeUses, usesOf, withHome } from "./model"

/**
 * A store as read: what it holds, and the text of each record of it set
 * aside as unreadable; null when it can't be read at all.
 */
export type KeptRead<T> = {
  readonly value: T
  readonly setAside: ReadonlyArray<string>
} | null

/** Studio's stores, handed in by a route that may load Studio's package. */
export type StudioUseStores = {
  readonly ideas: () => KeptRead<ReadonlyArray<UseIdea>>
  readonly videos: () => Promise<KeptRead<ReadonlyArray<UseVideo>>>
  /** Calls `listener` after each write to the videos on this page. */
  readonly subscribe: (listener: () => void) => () => void
}

export type UsePorts = {
  /** Each source kept in this device's storage. */
  readonly spoken: () => KeptRead<ReadonlyArray<SpokenCard>>
  readonly interview: () => KeptRead<ReadonlyArray<InterviewSent>>
  readonly rust: () => KeptRead<ReadonlyArray<WeekSent>>
  /** Studio's stores, once a route handed them in; null until then. */
  readonly studio: () => StudioUseStores | null
  /** Calls `listener` once Studio's stores are handed in. */
  readonly onStudio: (listener: () => void) => () => void
  readonly failed: (source: UseSource, error: unknown) => void
}

export type TakeUsesRuntime = {
  /** Every source read now. */
  readonly read: () => Promise<TakeUses>
  readonly subscribe: (listener: () => void) => () => void
  /** The latest read for a list; null before the first lands. */
  readonly getSnapshot: () => TakeUses | null
  /** Reads again for the lists. */
  readonly refresh: () => void
  /**
   * Home's word on what uses each take it just listed (`usedBy`); a take it
   * said nothing of, or nothing this build could read, keeps its last.
   */
  readonly told: (said: HomeSaid) => void
}

export function createTakeUses(ports: UsePorts): TakeUsesRuntime {
  /** Home's word on each take, as it last said it. */
  const home = new Map<string, ReadonlyArray<TakeUse>>()

  const asRead = <T>(kept: KeptRead<T>): Read<T> =>
    kept === null
      ? { kind: "unread" }
      : { kind: "read", value: kept.value, setAside: kept.setAside }

  const sync = <T>(source: UseSource, get: () => KeptRead<T>): Read<T> => {
    try {
      return asRead(get())
    } catch (error) {
      ports.failed(source, error)
      return { kind: "unread" }
    }
  }

  const videos = async (): Promise<Read<ReadonlyArray<UseVideo>>> => {
    const studio = ports.studio()
    if (studio === null) return { kind: "unread" }
    try {
      return asRead(await studio.videos())
    } catch (error) {
      ports.failed("videos", error)
      return { kind: "unread" }
    }
  }

  const read = async (): Promise<TakeUses> => {
    try {
      return await readAll()
    } catch (error) {
      // Never a reading of none: every source unread (TU1).
      ports.failed("videos", error)
      return withHome(ALL_UNREAD, home)
    }
  }

  const readAll = async (): Promise<TakeUses> => {
    const studio = ports.studio()
    const sources: UseSources = {
      spoken: sync("spoken", ports.spoken),
      ideas:
        studio === null
          ? { kind: "unread" }
          : sync("ideas", () => studio.ideas()),
      interview: sync("interview", ports.interview),
      rust: sync("rust", ports.rust),
      videos: await videos(),
    }
    return withHome(usesOf(sources), home)
  }

  let snapshot: TakeUses | null = null
  let reads = 0
  const listeners = new Set<() => void>()
  let unhook: (() => void) | null = null

  const refresh = (): void => {
    reads += 1
    const mine = reads
    void read().then((uses) => {
      if (mine !== reads) return
      snapshot = uses
      for (const listener of listeners) listener()
    })
  }

  const hook = (): (() => void) => {
    let studioOff: (() => void) | null = null
    const onStudio = (): void => {
      studioOff?.()
      studioOff = ports.studio()?.subscribe(refresh) ?? null
      refresh()
    }
    const off = ports.onStudio(onStudio)
    studioOff = ports.studio()?.subscribe(refresh) ?? null
    return (): void => {
      off()
      studioOff?.()
    }
  }

  return {
    read,
    subscribe(listener): () => void {
      listeners.add(listener)
      unhook ??= hook()
      refresh()
      return (): void => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          unhook?.()
          unhook = null
          // A list opened later shows no mark until its own read lands,
          // never one from before a pick changed.
          snapshot = null
          reads += 1
        }
      }
    },
    getSnapshot: () => snapshot,
    refresh,
    told(said): void {
      let changed = false
      for (const { id, usedBy } of said) {
        // Unsaid keeps home's last word; only a list, empty or not, moves it.
        if (usedBy === undefined) continue
        const next = homeUses(usedBy)
        const before = home.get(id) ?? []
        if (JSON.stringify(before) === JSON.stringify(next)) continue
        changed = true
        if (next.length === 0) home.delete(id)
        else home.set(id, next)
      }
      if (changed && listeners.size > 0) refresh()
    },
  }
}
