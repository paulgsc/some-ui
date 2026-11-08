/**
 * @vitest-environment jsdom
 *
 * The notes left on episodes, going home (SFEED6, `../episode-notes`): one
 * `PUT /feeds/:feed/notes/:id` of each note home hasn't answered for, each
 * answer read as `handlers::episode_notes::put_note` means it, and nothing
 * sent again that home holds or refused.
 */
import type { HomeCall } from "@some-ui/core-utils"
import { reportFailure } from "@some-ui/intent-kit"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Note } from "@/lib/episode-feedback"
import { episodeFeedback } from "@/lib/episode-feedback"
import {
  episodeNotesMoved,
  episodeNotesWaiting,
  phoneEpisodeNotes,
  sendEpisodeNotes,
} from "@/lib/home-link/episode-notes"

vi.mock("@some-ui/intent-kit", async (actual) => ({
  ...(await actual<object>()),
  reportFailure: vi.fn(),
}))

const note = (id: string, feed: Note["feed"] = "call"): Note => ({
  id,
  feed,
  episode: "2026-11-13",
  atMs: 134_000,
  categories: ["shallow", "musicLoud"],
  writtenAt: "2026-11-14T03:00:00.000Z",
})

/** Home's answer to one note's send, by its id. */
type Answer = { readonly status: number; readonly body?: unknown }

/** Home, answering each note by its id; held (`200`, carried back) by default. */
function home(
  answers: Readonly<Record<string, Answer>>,
  sent: Array<[string, string, unknown]>
): HomeCall {
  return (method, path, body) => {
    sent.push([method, path, body])
    const id = decodeURIComponent(path.split("/")[4] ?? "")
    const sentNote: unknown = JSON.parse(String(body))
    const answer = answers[id] ?? {
      status: 200,
      body: { change: "added", note: sentNote },
    }
    return Promise.resolve({
      status: answer.status,
      body: JSON.stringify(answer.body ?? {}),
    })
  }
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(reportFailure).mockClear()
})

describe("notes on episodes going home (SFEED6)", () => {
  it("puts each note as the phone keeps it, and sends one home holds no more", async () => {
    episodeFeedback.keep(note("a"))
    episodeFeedback.keep(note("b/1", "playoff-delta"))
    const storage = memoryStorage()
    const sent: Array<[string, string, unknown]> = []
    const moved = vi.fn()
    const stop = episodeNotesMoved.subscribe(moved)
    const port = phoneEpisodeNotes(storage, "p1")
    expect(await sendEpisodeNotes(port, home({}, sent))).toEqual({
      kind: "synced",
    })
    expect(sent).toEqual([
      ["PUT", "/feeds/call/notes/a", JSON.stringify(note("a"))],
      [
        "PUT",
        "/feeds/playoff-delta/notes/b%2F1",
        JSON.stringify(note("b/1", "playoff-delta")),
      ],
    ])
    expect(moved).toHaveBeenCalledTimes(2)
    stop()
    sent.length = 0
    await sendEpisodeNotes(port, home({}, sent))
    expect(sent).toEqual([])
    const counts = episodeNotesWaiting(storage, "p1")
    expect([counts.waiting, [...counts.held]]).toEqual([0, ["a", "b/1"]])
  })

  it("counts a note held only when home carries the same one back", async () => {
    episodeFeedback.keep(note("a"))
    const storage = memoryStorage()
    const other = { ...note("a"), atMs: 1 }
    await sendEpisodeNotes(
      phoneEpisodeNotes(storage, "p1"),
      home({ a: { status: 200, body: { change: "added", note: other } } }, [])
    )
    expect(episodeNotesWaiting(storage, "p1").waiting).toBe(1)
  })

  it("keeps a note home refused, offers it no more, and says so to the native log", async () => {
    episodeFeedback.keep(note("a"))
    const storage = memoryStorage()
    const sent: Array<[string, string, unknown]> = []
    const port = phoneEpisodeNotes(storage, "p1")
    await sendEpisodeNotes(port, home({ a: { status: 409 } }, sent))
    await sendEpisodeNotes(port, home({}, sent))
    expect(sent).toHaveLength(1)
    expect([...episodeNotesWaiting(storage, "p1").refused]).toEqual(["a"])
    expect(episodeFeedback.getSnapshot().map((n) => n.id)).toEqual(["a"])
    expect(reportFailure).toHaveBeenCalledTimes(1)
  })

  it("waits on a home that keeps no notes yet, and ends the run on one that forgot this phone", async () => {
    episodeFeedback.keep(note("a"))
    episodeFeedback.keep(note("b"))
    const storage = memoryStorage()
    const port = phoneEpisodeNotes(storage, "p1")
    const sent: Array<[string, string, unknown]> = []
    expect(
      await sendEpisodeNotes(port, home({ a: { status: 404 } }, sent))
    ).toEqual({ kind: "synced" })
    expect(sent).toHaveLength(1)
    expect(
      await sendEpisodeNotes(port, home({ a: { status: 401 } }, []))
    ).toEqual({ kind: "forgotten" })
    expect(episodeNotesWaiting(storage, "p1").waiting).toBe(2)
  })

  it("sends a spoken note's take, and counts it held only when home carries that take back", async () => {
    const spoken: Note = { ...note("s"), take: "take-7" }
    episodeFeedback.keep(spoken)
    const storage = memoryStorage()
    const sent: Array<[string, string, unknown]> = []
    const port = phoneEpisodeNotes(storage, "p1")
    const without = { ...note("s") }
    await sendEpisodeNotes(
      port,
      home(
        { s: { status: 200, body: { change: "added", note: without } } },
        sent
      )
    )
    expect(sent).toEqual([
      ["PUT", "/feeds/call/notes/s", JSON.stringify(spoken)],
    ])
    expect(episodeNotesWaiting(storage, "p1").waiting).toBe(1)
    await sendEpisodeNotes(port, home({}, sent))
    expect([...episodeNotesWaiting(storage, "p1").held]).toEqual(["s"])
  })

  it("waits, neither held nor refused, while home names the note's take as not held, and goes once it is", async () => {
    episodeFeedback.keep({ ...note("s"), take: "take-7" })
    const storage = memoryStorage()
    const sent: Array<[string, string, unknown]> = []
    const port = phoneEpisodeNotes(storage, "p1")
    const lacking = {
      status: 409,
      body: { error: { details: { notes: ["take-7"] } } },
    }
    await sendEpisodeNotes(port, home({ s: lacking }, sent))
    const waiting = episodeNotesWaiting(storage, "p1")
    expect([waiting.waiting, waiting.held.size, waiting.refused.size]).toEqual([
      1, 0, 0,
    ])
    expect(reportFailure).not.toHaveBeenCalled()
    await sendEpisodeNotes(port, home({}, sent))
    expect(sent).toHaveLength(2)
    expect([...episodeNotesWaiting(storage, "p1").held]).toEqual(["s"])
  })

  it("starts from nothing under another pairing", async () => {
    episodeFeedback.keep(note("a"))
    const storage = memoryStorage()
    await sendEpisodeNotes(phoneEpisodeNotes(storage, "p1"), home({}, []))
    expect(episodeNotesWaiting(storage, "p2").waiting).toBe(1)
    expect(episodeNotesWaiting(storage, null).waiting).toBe(1)
  })
})
