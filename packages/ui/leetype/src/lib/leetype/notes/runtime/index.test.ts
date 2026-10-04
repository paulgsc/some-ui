import type { NoteAnchor, RoundNote } from "@leetype/lib/leetype/notes"
import type { Dictation, Listening } from "@leetype/lib/leetype/notes/dictation"
import { DictationError } from "@leetype/lib/leetype/notes/dictation"
import type { ComposerRuntime } from "@leetype/lib/leetype/notes/runtime"
import { createNoteComposer } from "@leetype/lib/leetype/notes/runtime"
import type { NoteStore } from "@leetype/lib/leetype/notes/store"
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

/** A recognizer the test drives: each `listen` is one controllable utterance. */
function fakeDictation(): Dictation & {
  utterances: Array<{
    heard: (text: string) => void
    resolve: (text: string) => void
    reject: (error: unknown) => void
    stop: ReturnType<typeof vi.fn>
    cancel: ReturnType<typeof vi.fn>
  }>
} {
  const utterances: ReturnType<typeof fakeDictation>["utterances"] = []
  return {
    recognizer: "browser",
    utterances,
    listen(onHeard): Listening {
      let resolve: (text: string) => void = () => undefined
      let reject: (error: unknown) => void = () => undefined
      const done = new Promise<string>((res, rej) => {
        resolve = res
        reject = rej
      })
      const utterance = {
        heard: onHeard,
        resolve,
        reject,
        stop: vi.fn(),
        cancel: vi.fn(),
      }
      utterances.push(utterance)
      return { done, stop: utterance.stop, cancel: utterance.cancel }
    },
  }
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
    utterance!.resolve("what does the budget mean")
    await Promise.resolve()
    expect(store.notes.get("n1")).toMatchObject({
      text: "what does the budget mean",
      spoken: true,
    })
    expect(changes).toHaveBeenCalled()
  })

  it("turns a recognizer's failure into the composer's notice", async () => {
    const dictation = fakeDictation()
    const { runtime } = setup(dictation)
    runtime.dispatch({ type: "notePressed", anchor: ANCHOR })
    runtime.dispatch({ type: "kindPicked", kind: "gap" })
    runtime.dispatch({ type: "micPressed" })
    dictation.utterances[0]!.reject(new DictationError("denied"))
    await Promise.resolve()
    await Promise.resolve()
    expect(runtime.getSnapshot().notice).toMatch(/blocked/)
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

  it("removes the note on undo", () => {
    const { runtime, store } = setup(null)
    runtime.dispatch({ type: "notePressed", anchor: ANCHOR })
    runtime.dispatch({ type: "kindPicked", kind: "thought" })
    runtime.dispatch({ type: "undoPressed" })
    expect(store.notes.size).toBe(0)
    expect(runtime.getSnapshot().canListen).toBe(false)
  })
})
