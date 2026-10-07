import type { NoteAnchor, RoundNote } from "@leetype/lib/leetype/notes"
import { FINISH_TIMEOUT_MS } from "@leetype/lib/leetype/notes/composer"
import type { Dictation, Listening } from "@leetype/lib/leetype/notes/dictation"
import type { ComposerRuntime } from "@leetype/lib/leetype/notes/runtime"
import { createNoteComposer } from "@leetype/lib/leetype/notes/runtime"
import type { NoteStore } from "@leetype/lib/leetype/notes/store"
import type { ForeignOutcome, IntentError } from "@some-ui/intent-kit"
import { describe, expect, it, vi } from "vitest"

const ANCHOR: NoteAnchor = {
  roundId: "r",
  own: false,
  artifact: "budget",
  picked: null,
  committed: true,
  sessionId: "s",
}

function memoryStore(): NoteStore & { notes: Map<string, RoundNote> } {
  const notes = new Map<string, RoundNote>()
  return {
    notes,
    list: (): Array<RoundNote> => [...notes.values()],
    put: (note): void => {
      notes.set(note.id, note)
    },
    remove: (id): void => {
      notes.delete(id)
    },
  }
}

/**
 * A recognizer the test drives: each `listen` is one utterance whose
 * outcome the test settles, as a port's `callForeign` would.
 */
function fakeDictation(): Dictation & {
  utterances: Array<{
    heard: (text: string) => void
    settle: (outcome: ForeignOutcome<string>) => void
    stop: ReturnType<typeof vi.fn>
    cancel: ReturnType<typeof vi.fn>
  }>
} {
  const utterances: ReturnType<typeof fakeDictation>["utterances"] = []
  return {
    recognizer: "browser",
    utterances,
    listen(onHeard): Listening {
      let settle: (outcome: ForeignOutcome<string>) => void = () => undefined
      const outcome = new Promise<ForeignOutcome<string>>((resolve) => {
        settle = resolve
      })
      const utterance = {
        heard: onHeard,
        settle,
        stop: vi.fn(),
        cancel: vi.fn(),
      }
      utterances.push(utterance)
      return { outcome, stop: utterance.stop, cancel: utterance.cancel }
    },
  }
}

const BLOCKED: IntentError = {
  kind: "rejected",
  retryable: false,
  summary: "The microphone is blocked for this page.",
  cause: "not-allowed",
}

function setup(dictation: Dictation | null = fakeDictation()): {
  runtime: ComposerRuntime
  store: ReturnType<typeof memoryStore>
  detach: () => void
  hide: () => void
} {
  const store = memoryStore()
  let visibility: (hidden: boolean) => void = () => undefined
  const runtime = createNoteComposer({
    store,
    dictation,
    now: () => Date.parse("2026-10-03T12:00:00.000Z"),
    newId: (): string => "n1",
    onVisibility: (listener): (() => void) => {
      visibility = listener
      listener(false)
      return () => undefined
    },
  })
  const detach = runtime.attach()
  return { runtime, store, detach, hide: (): void => visibility(true) }
}

describe("the note composer's runtime", () => {
  it("stores a note with an id and a time the moment its kind is picked", () => {
    const { runtime, store } = setup()
    runtime.dispatch({ type: "notePressed", anchor: ANCHOR })
    runtime.dispatch({ type: "kindPicked", kind: "unclear" })
    expect(store.notes.get("n1")).toMatchObject({
      kind: "unclear",
      at: "2026-10-03T12:00:00.000Z",
      text: "",
      anchor: ANCHOR,
    })
  })

  it("stores a spoken transcript, and notifies as words are heard", async () => {
    const dictation = fakeDictation()
    const { runtime, store } = setup(dictation)
    const changes = vi.fn()
    runtime.subscribe(changes)
    runtime.dispatch({ type: "notePressed", anchor: ANCHOR })
    runtime.dispatch({ type: "kindPicked", kind: "gap" })
    runtime.dispatch({ type: "micPressed" })
    const [utterance] = dictation.utterances
    utterance!.heard("what does")
    expect(runtime.getSnapshot().composer).toMatchObject({
      voice: { kind: "listening", heard: "what does" },
    })
    runtime.dispatch({ type: "micPressed" })
    expect(utterance!.stop).toHaveBeenCalled()
    utterance!.settle({
      status: "succeeded",
      value: "what does the budget mean",
    })
    await Promise.resolve()
    expect(store.notes.get("n1")).toMatchObject({
      text: "what does the budget mean",
      spoken: true,
    })
    expect(changes).toHaveBeenCalled()
  })

  it("turns a recognizer's failure into the composer's notice, withdrawing what cannot work", async () => {
    const dictation = fakeDictation()
    const { runtime } = setup(dictation)
    runtime.dispatch({ type: "notePressed", anchor: ANCHOR })
    runtime.dispatch({ type: "kindPicked", kind: "gap" })
    runtime.dispatch({ type: "micPressed" })
    dictation.utterances[0]!.settle({ status: "failed", error: BLOCKED })
    await Promise.resolve()
    expect(runtime.getSnapshot().notice).toMatch(/blocked/)
    expect(runtime.getSnapshot().canListen).toBe(false)
    runtime.dispatch({ type: "micPressed" })
    expect(dictation.utterances).toHaveLength(1)
  })

  it("finishes the utterance when the page hides, and cancels it on detach", () => {
    const dictation = fakeDictation()
    const { runtime, hide, detach } = setup(dictation)
    runtime.dispatch({ type: "notePressed", anchor: ANCHOR })
    runtime.dispatch({ type: "kindPicked", kind: "gap" })
    runtime.dispatch({ type: "micPressed" })
    hide()
    expect(dictation.utterances[0]!.stop).toHaveBeenCalled()
    detach()
    expect(dictation.utterances[0]!.cancel).toHaveBeenCalled()
  })

  it("closes a note whose transcript never lands, after the finish timeout", () => {
    vi.useFakeTimers()
    try {
      const dictation = fakeDictation()
      const { runtime } = setup(dictation)
      runtime.dispatch({ type: "notePressed", anchor: ANCHOR })
      runtime.dispatch({ type: "kindPicked", kind: "gap" })
      runtime.dispatch({ type: "micPressed" })
      runtime.dispatch({ type: "donePressed" })
      runtime.dispatch({ type: "donePressed" })
      expect(runtime.getSnapshot().composer.phase).toBe("noted")
      vi.advanceTimersByTime(FINISH_TIMEOUT_MS)
      expect(runtime.getSnapshot().composer.phase).toBe("closed")
      expect(dictation.utterances[0]!.cancel).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("writes nothing a cancelled recognizer reports afterwards", async () => {
    const dictation = fakeDictation()
    const { runtime, store, detach } = setup(dictation)
    runtime.dispatch({ type: "notePressed", anchor: ANCHOR })
    runtime.dispatch({ type: "kindPicked", kind: "gap" })
    runtime.dispatch({ type: "micPressed" })
    detach()
    const [utterance] = dictation.utterances
    utterance!.heard("after unmount")
    utterance!.settle({ status: "succeeded", value: "after unmount" })
    await Promise.resolve()
    expect(store.notes.get("n1")?.text).toBe("")
    expect(runtime.getSnapshot().composer).toMatchObject({
      voice: { heard: "" },
    })
  })

  it("removes the note on undo", () => {
    const { runtime, store } = setup(null)
    runtime.dispatch({ type: "notePressed", anchor: ANCHOR })
    runtime.dispatch({ type: "kindPicked", kind: "thought" })
    runtime.dispatch({ type: "undoPressed" })
    expect(store.notes.size).toBe(0)
    expect(runtime.getSnapshot().canListen).toBe(false)
  })
})
