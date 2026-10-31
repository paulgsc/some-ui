/**
 * Ports for the session's tests: a microphone whose takes land when a test
 * says so, a clock, ids, a page that is never hidden, and a clipboard that
 * takes whatever is copied.
 */
import type { NoteView, TakeEnd } from "@rust-rounds/lib/play/machine"
import type { NotesPort, RustRoundsPorts } from "@rust-rounds/lib/play/runtime"
import { keptRounds } from "@rust-rounds/lib/play/store"
import { inMemoryStorage } from "@some-ui/core-utils"
import { vi } from "vitest"

export type FakeNotes = NotesPort & {
  /** The lines takes were started on, in order. */
  readonly started: Array<string>
  /** The notes the phone holds, as the desk lists them. */
  readonly held: Array<{ id: string; line: string; takenAt: number }>
  /** Ends the take under way: kept as `id`, or too short when null. */
  readonly land: (id: string | null) => void
  /** Ends the take under way kept nothing: `failed` or `full`. */
  readonly lose: (end: Extract<TakeEnd, "failed" | "full">) => void
  /** The microphone refuses every take from now on. */
  readonly refuse: (why: string) => void
}

export function fakeNotes(): FakeNotes {
  let view: NoteView = {
    take: { kind: "idle" },
    ended: null,
    blocked: null,
  }
  let line = ""
  let refused: string | null = null
  const listeners = new Set<() => void>()
  const set = (next: NoteView): void => {
    view = next
    for (const listener of listeners) listener()
  }
  const end = (how: TakeEnd, note: string | null): void => {
    set({
      take: { kind: "idle" },
      blocked: how === "blocked" ? refused : null,
      ended: { seq: (view.ended?.seq ?? 0) + 1, line, end: how, note },
    })
  }
  const started: Array<string> = []
  const held: FakeNotes["held"] = []
  return {
    started,
    held,
    getSnapshot: () => view,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    start(next): void {
      if (view.take.kind !== "idle") return
      line = next
      if (refused !== null) {
        end("blocked", null)
        return
      }
      started.push(next)
      set({ ...view, take: { kind: "recording" } })
    },
    stop(): void {
      if (view.take.kind === "recording") {
        set({ ...view, take: { kind: "keeping" } })
      }
    },
    keptOn: (on, since): string | null =>
      held.find((each) => each.line === on && each.takenAt >= since)?.id ??
      null,
    land(id): void {
      // Listed once kept: after any take on this line began.
      if (id !== null) held.push({ id, line, takenAt: Number.MAX_SAFE_INTEGER })
      end(id === null ? "short" : "kept", id)
    },
    lose(how): void {
      end(how, null)
    },
    refuse(why): void {
      refused = why
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
