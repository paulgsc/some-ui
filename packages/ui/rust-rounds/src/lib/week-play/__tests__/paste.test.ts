/**
 * An error pasted in a week, with a note on it (RR13, #2504), on the
 * simulated microphone and the real take pattern: the note waits on the
 * phone, named `<week>:PASTE:<at>`, until Keep keeps the paste and only
 * then lets it go; a paste begun is kept as it is typed; and the week's own
 * clean-up never drops a paste's note.
 */
import type { Week } from "@rust-rounds/lib/formats/week"
import { QUILLMOSS_WEEK } from "@rust-rounds/lib/sample-week"
import { pasteLine } from "@rust-rounds/lib/week-play/paste"
import type { RustWeek } from "@rust-rounds/lib/week-play/runtime"
import { createRustWeek } from "@rust-rounds/lib/week-play/runtime"
import { pasteStores } from "@rust-rounds/lib/week-play/store"
import type { KeyedStorage } from "@some-ui/core-utils"
import { inMemoryStorage } from "@some-ui/core-utils"
import { ONE_TAKE } from "@some-ui/voice-capture"
import type { SimulatedPattern } from "@some-ui/voice-capture/testing"
import { simulatedPattern } from "@some-ui/voice-capture/testing"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const NOW = "2026-11-10T18:00:00.000Z"

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(NOW))
})

afterEach(() => {
  vi.useRealTimers()
})

const pass = async (ms = 0): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms)
}

function phone(
  storage: KeyedStorage,
  simulated: SimulatedPattern,
  playing: Week = QUILLMOSS_WEEK
): {
  week: RustWeek
  release: ReturnType<typeof vi.fn>
  discard: ReturnType<typeof vi.fn>
} {
  const { pattern, store } = simulated
  const release = vi.fn(store.release)
  const discard = vi.fn(store.discard)
  const week = createRustWeek({
    week: { week: playing, sha256: "a", runs: {}, ended: [] },
    takes: {
      pattern,
      takes: { getSnapshot: store.getSnapshot, subscribe: store.subscribe },
      discard,
      release,
    },
    storage,
    home: { reach: () => "near", subscribe: () => (): void => undefined },
    heard: () => Promise.resolve({ kind: "notYet" }),
    homeHolds: () => false,
    now: Date.now,
    newId: () => "unused",
    engage: () => undefined,
    onVisibility: (listener) => {
      listener(false)
      return (): void => undefined
    },
  })
  week.attach()
  return { week, release, discard }
}

const onConfirm = (): SimulatedPattern =>
  simulatedPattern({ options: { ...ONE_TAKE, send: "on-confirm" } })

async function sayNote(
  on: RustWeek,
  simulated: SimulatedPattern
): Promise<void> {
  on.paste.tap(simulated.pattern.getSnapshot())
  await pass(2_000)
  on.paste.tap(simulated.pattern.getSnapshot())
  await pass()
}

describe("an error pasted in a week (RR13)", () => {
  it("keeps the note waiting until Keep, then keeps the paste and lets the note go", async () => {
    const storage = inMemoryStorage()
    const simulated = onConfirm()
    const { week, release } = phone(storage, simulated)
    week.paste.open()
    week.paste.dispatch({ type: "text", text: "error[E0502]: cannot borrow" })
    await sayNote(week, simulated)
    await sayNote(week, simulated)
    const takes = simulated.store.getSnapshot()
    // A line home takes (paulgsc/server#727): the week, and when it was begun.
    expect(new Set(takes.map((take) => take.answers))).toEqual(
      new Set([pasteLine(QUILLMOSS_WEEK.id, NOW)])
    )
    expect(release).not.toHaveBeenCalled()

    week.paste.dispatch({ type: "keep" })
    const current = takes.find((take) => take.standing === "current")
    expect(pasteStores(storage).pastes.list()).toEqual([
      {
        week: QUILLMOSS_WEEK.id,
        at: NOW,
        text: "error[E0502]: cannot borrow",
        note: current?.id,
      },
    ])
    expect(release).toHaveBeenCalledWith([current?.id])
    // The note it replaced never left the phone: gone at Keep.
    expect(simulated.store.getSnapshot().map((take) => take.id)).toEqual([
      current?.id,
    ])
    expect(week.paste.getSnapshot()).toEqual({
      showing: false,
      draft: null,
      notice: "kept",
    })
  })

  it("keeps a paste begun as it is typed, and nothing without text", () => {
    const storage = inMemoryStorage()
    const first = phone(storage, onConfirm())
    first.week.paste.open()
    first.week.paste.dispatch({ type: "keep" })
    expect(pasteStores(storage).pastes.list()).toEqual([])
    first.week.paste.dispatch({ type: "text", text: "warning: unused" })
    first.week.paste.dispatch({ type: "close" })
    const again = phone(storage, onConfirm())
    expect(again.week.paste.getSnapshot().draft?.text).toBe("warning: unused")
  })

  it("lets go home, at the next opening, a note a kept paste names that still waits", async () => {
    const storage = inMemoryStorage()
    const simulated = onConfirm()
    const first = phone(storage, simulated)
    first.week.paste.open()
    first.week.paste.dispatch({ type: "text", text: "error[E0599]" })
    await sayNote(first.week, simulated)
    // A Keep whose release the phone couldn't store.
    first.release.mockReturnValueOnce(false)
    first.week.paste.dispatch({ type: "keep" })
    const [note] = simulated.store.getSnapshot()
    expect(note?.waits).toBe(true)
    const again = phone(storage, simulated)
    expect(again.release).toHaveBeenCalledWith([note?.id])
  })

  it("never carries a paste begun in one week into the next", () => {
    const storage = inMemoryStorage()
    const first = phone(storage, onConfirm())
    first.week.paste.open()
    first.week.paste.dispatch({ type: "text", text: "error[E0499]" })
    const next = { ...QUILLMOSS_WEEK, id: "2026-w47" }
    const later = phone(storage, onConfirm(), next)
    expect(later.week.paste.getSnapshot().draft).toBeNull()
    later.week.paste.open()
    later.week.paste.dispatch({ type: "text", text: "warning: dead_code" })
    later.week.paste.dispatch({ type: "keep" })
    expect(pasteStores(storage).pastes.list()).toEqual([
      { week: next.id, at: NOW, text: "warning: dead_code", note: null },
    ])
    // The earlier week's paste is still there, as it was left.
    expect(pasteStores(storage).draft.read(QUILLMOSS_WEEK.id)?.text).toBe(
      "error[E0499]"
    )
  })

  it("clears, at the next opening, a draft a kept paste already holds", () => {
    const storage = inMemoryStorage()
    const first = phone(storage, onConfirm())
    first.week.paste.open()
    first.week.paste.dispatch({ type: "text", text: "error[E0382]" })
    const draft = storage.getItem("some-ui:rust-rounds.week-paste-drafts")
    first.week.paste.dispatch({ type: "keep" })
    // A Keep whose clearing of the draft the phone couldn't store.
    if (draft !== null) {
      storage.setItem("some-ui:rust-rounds.week-paste-drafts", draft)
    }
    const again = phone(storage, onConfirm())
    expect(again.week.paste.getSnapshot().draft).toBeNull()
    expect(pasteStores(storage).draft.read(QUILLMOSS_WEEK.id)).toBeNull()
    expect(pasteStores(storage).pastes.list()).toHaveLength(1)
  })

  it("never counts another paste begun at the same instant as kept", () => {
    const stores = pasteStores(inMemoryStorage())
    const paste = { week: QUILLMOSS_WEEK.id, at: NOW, text: "a", note: null }
    expect(stores.pastes.add(paste)).toBe(true)
    expect(stores.pastes.add(paste)).toBe(true)
    expect(stores.pastes.add({ ...paste, text: "b" })).toBe(false)
    expect(stores.pastes.list()).toEqual([paste])
  })

  it("deletes, at the next opening, a note a kept paste replaced that still waits", async () => {
    const storage = inMemoryStorage()
    const simulated = onConfirm()
    const first = phone(storage, simulated)
    first.week.paste.open()
    first.week.paste.dispatch({ type: "text", text: "error[E0308]" })
    await sayNote(first.week, simulated)
    await sayNote(first.week, simulated)
    // A Keep whose delete of the replaced note the phone couldn't store.
    first.discard.mockReturnValueOnce(false)
    first.week.paste.dispatch({ type: "keep" })
    const [kept] = pasteStores(storage).pastes.list()
    const replaced = simulated.store
      .getSnapshot()
      .find((take) => take.id !== kept?.note)
    expect(replaced?.waits).toBe(true)
    const again = phone(storage, simulated)
    expect(again.discard).toHaveBeenCalledWith([replaced?.id])
    expect(simulated.store.getSnapshot().map((take) => take.id)).toEqual([
      kept?.note,
    ])
  })

  it("says when a change to the paste couldn't be kept", () => {
    const storage = inMemoryStorage()
    const on = phone(storage, onConfirm())
    on.week.paste.open()
    storage.setItem = (): void => {
      throw new Error("full")
    }
    on.week.paste.dispatch({ type: "text", text: "error" })
    expect(on.week.paste.getSnapshot().notice).toBe("draftNotKept")
  })

  it("is left waiting when the week opens: its note answers no ticket", async () => {
    const storage = inMemoryStorage()
    const simulated = onConfirm()
    const first = phone(storage, simulated)
    first.week.paste.open()
    await sayNote(first.week, simulated)
    phone(storage, simulated)
    await pass()
    expect(simulated.store.getSnapshot()).toHaveLength(1)
  })
})
