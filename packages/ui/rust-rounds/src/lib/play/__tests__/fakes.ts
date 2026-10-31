/**
 * Ports for the session's tests: a microphone whose takes land when a test
 * says so, a clock, ids, a page that is never hidden, and a clipboard that
 * takes whatever is copied.
 */
import type { NoteView } from "@rust-rounds/lib/play/machine"
import { QUIET_NOTES } from "@rust-rounds/lib/play/machine"
import type { NotesPort, RustRoundsPorts } from "@rust-rounds/lib/play/runtime"
import { keptRounds } from "@rust-rounds/lib/play/store"
import { inMemoryStorage } from "@some-ui/core-utils"
import { vi } from "vitest"

export type FakeNotes = NotesPort & {
  /** The lines takes were started on, in order. */
  readonly started: Array<string>
  /** Ends the take under way: kept as `id`, or too short when null. */
  readonly land: (id: string | null) => void
  readonly refuse: (why: string) => void
  readonly fill: () => void
}

export function fakeNotes(): FakeNotes {
  let view: NoteView = QUIET_NOTES
  const listeners = new Set<() => void>()
  const set = (next: NoteView): void => {
    view = next
    for (const listener of listeners) listener()
  }
  const started: Array<string> = []
  return {
    started,
    getSnapshot: () => view,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    start(line): void {
      if (view.take.kind !== "idle" || view.full) return
      if (view.blocked !== null) {
        // The microphone refuses again: the take ends with none.
        set({ ...view })
        return
      }
      started.push(line)
      set({ ...view, take: { kind: "recording" }, ended: null })
    },
    stop(): void {
      if (view.take.kind === "recording") {
        set({ ...view, take: { kind: "keeping" } })
      }
    },
    reset(): void {
      if (view.ended !== null) set({ ...view, ended: null })
    },
    land(id): void {
      set({
        ...view,
        take: { kind: "idle" },
        kept: id === null ? view.kept : { id },
        ended: id === null ? "short" : "kept",
      })
    },
    refuse(why): void {
      set({ ...view, blocked: why })
    },
    fill(): void {
      set({ ...view, full: true })
    },
  }
}

export type FakePorts = RustRoundsPorts & {
  readonly notes: FakeNotes
  readonly storage: Storage
  readonly copied: Array<string>
}

/** Ids unique across every opening in a test file, as `crypto.randomUUID` makes them. */
let ids = 0

/** The phone's ports over `storage`, the clock starting the evening of 2026-10-30. */
export function fakePorts(
  storage: Storage = inMemoryStorage(),
  notes: FakeNotes = fakeNotes()
): FakePorts {
  let clock = Date.parse("2026-10-30T19:00:00Z")
  const copied: Array<string> = []
  return {
    storage,
    notes,
    copied,
    store: keptRounds(storage),
    copy: vi.fn((text: string) => {
      copied.push(text)
      return Promise.resolve()
    }),
    now: (): number => {
      clock += 1_000
      return clock
    },
    newId: (): string => {
      ids += 1
      return `session-${ids}`
    },
    onVisibility: () => () => undefined,
  }
}
