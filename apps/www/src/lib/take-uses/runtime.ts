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
  Read,
  TakeUses,
  UseIdea,
  UseSource,
  UseSources,
  UseVideo,
} from "./model"
import { usesOf } from "./model"

/** Studio's stores, handed in by a route that may load Studio's package. */
export type StudioUseStores = {
  /** The ideas kept; null when this phone can't read them. */
  readonly ideas: () => ReadonlyArray<UseIdea> | null
  readonly videos: () => Promise<ReadonlyArray<UseVideo>>
  /** Calls `listener` after each write to the videos on this page. */
  readonly subscribe: (listener: () => void) => () => void
}

export type UsePorts = {
  /** Each source kept in this device's storage; null when it can't be read. */
  readonly spoken: () => ReadonlyArray<SpokenCard> | null
  readonly interview: () => ReadonlyArray<InterviewSent> | null
  readonly rust: () => ReadonlyArray<WeekSent> | null
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
}

export function createTakeUses(ports: UsePorts): TakeUsesRuntime {
  const sync = <T>(source: UseSource, get: () => T | null): Read<T> => {
    try {
      const value = get()
      return value === null ? { kind: "unread" } : { kind: "read", value }
    } catch (error) {
      ports.failed(source, error)
      return { kind: "unread" }
    }
  }

  const videos = async (): Promise<Read<ReadonlyArray<UseVideo>>> => {
    const studio = ports.studio()
    if (studio === null) return { kind: "unread" }
    try {
      return { kind: "read", value: await studio.videos() }
    } catch (error) {
      ports.failed("videos", error)
      return { kind: "unread" }
    }
  }

  const read = async (): Promise<TakeUses> => {
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
    return usesOf(sources)
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
        }
      }
    },
    getSnapshot: () => snapshot,
    refresh,
  }
}
