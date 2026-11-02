/**
 * @vitest-environment jsdom
 *
 * My data's read of every recording on this phone (MD2,
 * `voice-copy`'s `recordingsOnPhone`): Studio's takes and the soundbites
 * are read from their stores now, not as the last copy pass read them
 * (none runs while unpaired), a Rust Rounds note whose line names no card
 * is still a recording here, and a store not handed in yet is named.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const stores = vi.hoisted(
  (): { studio: unknown; soundbites: unknown; rust: Array<unknown> } => ({
    studio: null,
    soundbites: null,
    rust: [],
  })
)

vi.mock("@/lib/studio-keeping", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  studioKeeping: (): unknown => stores.studio,
}))
vi.mock("@/lib/soundbite-keeping", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  soundbiteKeeping: (): unknown => stores.soundbites,
}))
vi.mock("@/lib/rust-rounds", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  rustRoundRef: (): ((line: string) => string | null) => () => null,
  rustRoundsDesk: {
    kept: (): Array<unknown> => stores.rust,
    audio: (): Promise<Blob | null> => Promise.resolve(new Blob(["r"])),
  },
}))

const { recordingsOnPhone } = await import("@/lib/home-link/voice-copy")

beforeEach(() => {
  stores.studio = null
  stores.soundbites = null
  stores.rust = []
})

describe("every recording on this phone, for My data", () => {
  it("names the stores not handed in yet, and lists nothing of theirs", async () => {
    await expect(recordingsOnPhone()).resolves.toEqual({
      notes: [],
      unread: ["studio", "soundbite"],
    })
  })

  it("reads Studio's takes and the soundbites now, with no copy pass, and keeps a Rust Rounds note no card names", async () => {
    stores.studio = {
      store: {
        list: (): Promise<Array<unknown>> => Promise.resolve([]),
        audio: (): Promise<Blob | null> => Promise.resolve(new Blob(["s"])),
      },
      notesForHome: (): Array<unknown> => [
        {
          project: "ep07",
          id: "take-1",
          ref: "ep07:s3:4",
          at: "2026-11-01T09:00:00.000Z",
          contentType: "audio/webm",
        },
      ],
    }
    stores.soundbites = {
      store: {
        list: (): Promise<Array<unknown>> =>
          Promise.resolve([
            {
              id: "bite-1",
              context: { source: "direct" },
              recordedAt: "2026-11-01T10:00:00.000Z",
              mimeType: "audio/webm",
            },
          ]),
        audio: (): Promise<Blob | null> => Promise.resolve(new Blob(["b"])),
      },
    }
    stores.rust = [
      {
        id: "note-1",
        line: "no card",
        takenAt: Date.parse("2026-11-01T11:00:00.000Z"),
        mimeType: "audio/webm",
      },
    ]
    const { notes, unread } = await recordingsOnPhone()
    expect(unread).toEqual([])
    expect(notes.map(({ id, of, at }) => ({ id, of, at }))).toEqual([
      { id: "take-1", of: "studio", at: "2026-11-01T09:00:00.000Z" },
      { id: "bite-1", of: "soundbite", at: "2026-11-01T10:00:00.000Z" },
      { id: "note-1", of: "rust-round", at: "2026-11-01T11:00:00.000Z" },
    ])
    await expect(notes[0]?.audio()).resolves.toBeInstanceOf(Blob)
  })
})
