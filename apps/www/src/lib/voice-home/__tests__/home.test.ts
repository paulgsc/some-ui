/**
 * One exchange of voice notes with home (`../home`), against a home that
 * answers as paulgsc/server's `PUT /voice-notes/:id` does: a note held once
 * its hash is the phone's, a replay unchanged, other audio a refusal, a
 * field home won't take a refusal, a body that didn't arrive a wait, and a
 * stopped choice the end of it.
 */
import type { HomeAnswer, HomeBytes, HomeCall } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

import type { VoiceHomePort } from "@/lib/voice-home/home"
import { exchangeVoice, NOTE_CEILING } from "@/lib/voice-home/home"
import type { VoiceHomeState, VoiceOut } from "@/lib/voice-home/model"
import { INITIAL_VOICE_HOME, stepVoiceHome } from "@/lib/voice-home/model"

const note = (id: string, of: VoiceOut["of"] = "reflection"): VoiceOut => ({
  id,
  of,
  ref: of === "jobs" ? "2026-10-25:pick-1" : "session-7f2a",
  at: "2026-10-25T03:10:00.000Z",
  contentType: "audio/webm;codecs=opus",
})

/** A port over a record, with each note's audio its id's bytes. */
function port(
  notes: ReadonlyArray<VoiceOut>,
  audio: (id: string) => Blob | null = (id) => new Blob([id])
): VoiceHomePort & { current: () => VoiceHomeState } {
  let state = notes.reduce(
    (s, n) => stepVoiceHome(s, { kind: "copied", note: n }),
    INITIAL_VOICE_HOME
  )
  return {
    current: () => state,
    state: () => state,
    audio: (id) => Promise.resolve(audio(id)),
    encode: async (blob): Promise<{ base64: string; sha256: string }> => {
      const text = await blob.text()
      return { base64: btoa(text), sha256: `sha-of-${text}` }
    },
    answered: (event): void => {
      state = stepVoiceHome(state, event)
    },
  }
}

type Sent = { path: string; body: HomeBytes }

/** Home, answering each note from `answer` (by default holding it). */
function home(answer?: (id: string, body: HomeBytes) => HomeAnswer): {
  send: HomeCall
  sent: Array<Sent>
} {
  const sent: Array<Sent> = []
  const held = (id: string, body: HomeBytes): HomeAnswer => ({
    status: 200,
    body: JSON.stringify({
      change: "added",
      note: { id, sha256: `sha-of-${atob(body.base64)}` },
    }),
  })
  return {
    sent,
    send: (method, path, body): Promise<HomeAnswer> => {
      expect(method).toBe("PUT")
      if (typeof body !== "object") throw new Error("not bytes")
      sent.push({ path, body })
      const id = decodeURIComponent(path.split("/")[2]?.split("?")[0] ?? "")
      return Promise.resolve((answer ?? held)(id, body))
    },
  }
}

const refusal = (details: Record<string, Array<string>>): HomeAnswer => ({
  status: 422,
  body: JSON.stringify({ error: { details } }),
})

describe("sending voice notes home", () => {
  it("sends each note as its audio, with what it belongs to, and counts it home's once the hash matches", async () => {
    const p = port([note("n1"), note("n2", "jobs")])
    const h = home()
    await expect(exchangeVoice(p, h.send)).resolves.toEqual({ kind: "synced" })
    expect(h.sent).toEqual([
      {
        path: "/voice-notes/n1?of=reflection&ref=session-7f2a&at=2026-10-25T03%3A10%3A00.000Z",
        body: { contentType: "audio/webm;codecs=opus", base64: btoa("n1") },
      },
      {
        path: "/voice-notes/n2?of=jobs&ref=2026-10-25%3Apick-1&at=2026-10-25T03%3A10%3A00.000Z",
        body: { contentType: "audio/webm;codecs=opus", base64: btoa("n2") },
      },
    ])
    expect(p.current()).toMatchObject({ waiting: [], held: ["n1", "n2"] })
  })

  it("sends a game bite with every field it keeps, beside what it belongs to", async () => {
    const bite: VoiceOut = {
      ...note("b1"),
      of: "game",
      ref: "401772981",
      fields: { how: "offered", scenario: "in.third-long", strip: "Q3 8:42" },
    }
    const h = home()
    await exchangeVoice(port([bite]), h.send)
    expect(h.sent.map(({ path }) => path)).toEqual([
      "/voice-notes/b1?of=game&ref=401772981&at=2026-10-25T03%3A10%3A00.000Z&how=offered&scenario=in.third-long&strip=Q3+8%3A42",
    ])
  })

  it("takes a replay home answers unchanged as held, and sends nothing held again", async () => {
    const p = port([note("n1")])
    const replay = home((id, body) => ({
      status: 200,
      body: JSON.stringify({
        change: "unchanged",
        note: { id, sha256: `sha-of-${atob(body.base64)}` },
      }),
    }))
    await exchangeVoice(p, replay.send)
    expect(p.current().held).toEqual(["n1"])
    const again = home()
    await exchangeVoice(p, again.send)
    expect(again.sent).toEqual([])
  })

  it("keeps other audio under the id, and a field home won't take, as refusals, and goes on", async () => {
    const p = port([note("n1"), note("n2"), note("n3")])
    const h = home((id, body) =>
      id === "n1"
        ? { status: 409, body: '{"error":{"code":"conflict"}}' }
        : id === "n2"
          ? refusal({ ref: ["not what the note belongs to"] })
          : {
              status: 200,
              body: JSON.stringify({
                note: { id, sha256: `sha-of-${atob(body.base64)}` },
              }),
            }
    )
    await expect(exchangeVoice(p, h.send)).resolves.toEqual({ kind: "synced" })
    expect(p.current()).toMatchObject({
      waiting: [],
      held: ["n3"],
      refused: [
        { id: "n1", why: "home holds another recording under its name" },
        { id: "n2", why: "ref not what the note belongs to" },
      ],
    })
  })

  it("lets a note wait when only its body is refused: the bytes didn't arrive", async () => {
    const p = port([note("n1"), note("n2")])
    const h = home(() => refusal({ body: ["empty"] }))
    await expect(exchangeVoice(p, h.send)).resolves.toEqual({
      kind: "failed",
      why: "a voice note: home answered 422",
    })
    expect(h.sent).toHaveLength(1)
    expect(p.current().waiting.map(({ id }) => id)).toEqual(["n1", "n2"])
  })

  it("ends at a stopped choice or a forgotten phone, refusing nothing", async () => {
    const stopped = port([note("n1")])
    await expect(
      exchangeVoice(
        stopped,
        home(() => ({
          status: 409,
          body: '{"error":{"code":"sharing_stopped"}}',
        })).send
      )
    ).resolves.toEqual({
      kind: "failed",
      why: "a voice note: home answered 409",
    })
    expect(stopped.current().refused).toEqual([])

    const forgotten = port([note("n1")])
    await expect(
      exchangeVoice(forgotten, home(() => ({ status: 401, body: "" })).send)
    ).resolves.toEqual({ kind: "forgotten" })
    expect(forgotten.current().waiting).toHaveLength(1)
  })

  it("does not count a note home's whose hash home answers otherwise, or an answer it can't read", async () => {
    for (const body of [
      JSON.stringify({ note: { id: "n1", sha256: "another" } }),
      JSON.stringify({ note: { id: "n9", sha256: "sha-of-n1" } }),
      "not json",
    ]) {
      const p = port([note("n1")])
      await expect(
        exchangeVoice(p, home(() => ({ status: 200, body })).send)
      ).resolves.toEqual({
        kind: "failed",
        why: "a voice note: home answered 200",
      })
      expect(p.current().waiting).toHaveLength(1)
    }
  })

  it("refuses, without sending, a note whose copy is gone or longer than home keeps", async () => {
    const big = new Blob([new Uint8Array(NOTE_CEILING + 1)])
    const p = port([note("gone"), note("big")], (id) =>
      id === "gone" ? null : big
    )
    const h = home()
    await exchangeVoice(p, h.send)
    expect(h.sent).toEqual([])
    expect(p.current().refused).toEqual([
      { id: "gone", why: "its recording is gone from this phone" },
      { id: "big", why: "longer than home keeps" },
    ])
  })
})
