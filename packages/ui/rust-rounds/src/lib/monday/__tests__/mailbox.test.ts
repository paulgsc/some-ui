import {
  get,
  list,
  noteOfTranscript,
  put,
} from "@rust-rounds/lib/monday/mailbox"
import type { Fetch, Listed, Mailbox } from "@rust-rounds/lib/monday/mailbox"
import { describe, expect, it } from "vitest"

/** A mailbox in memory: nothing here reaches the live one (MB1). */
function fakeMailbox(items: Record<string, string>): {
  mailbox: Mailbox
  calls: Array<string>
} {
  const calls: Array<string> = []
  const fetch: Fetch = (url, init) => Promise.resolve(answer(url, init))
  const answer = (url: string, init?: RequestInit): Response => {
    calls.push(`${init?.method ?? "GET"} ${url}`)
    const path = new URL(url).pathname
    const [, , folder, , name] = path.split("/")
    if (init?.method === "PUT")
      return new Response("", { status: name === "taken.json" ? 409 : 201 })
    if (name !== undefined) {
      const body = items[decodeURIComponent(name)]
      return body === undefined
        ? new Response("", { status: 404 })
        : new Response(body)
    }
    const after = Number(new URL(url).searchParams.get("after"))
    const listed = Object.keys(items)
      .map((n, i) => ({ seq: i + 1, name: n, sha256: "" }))
      .filter((item) => item.seq > after)
      .slice(0, 2)
    return Response.json(
      folder === "brief" ? { items: listed } : { nope: true }
    )
  }
  return { mailbox: { url: "https://mailbox.test", token: "t", fetch }, calls }
}

async function sum(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  )
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

describe("the routine's mailbox", () => {
  it("lists every page, oldest first", async () => {
    const { mailbox, calls } = fakeMailbox({
      "a.json": "1",
      "b.json": "2",
      "c.json": "3",
    })
    expect((await list(mailbox, "brief")).map((i) => i.name)).toEqual([
      "a.json",
      "b.json",
      "c.json",
    ])
    expect(calls).toHaveLength(3)
    await expect(list(mailbox, "index")).rejects.toThrow("isn't a listing")
  })

  it("reads an item only when its bytes match the listing", async () => {
    const { mailbox } = fakeMailbox({ "a.json": '{"x":1}' })
    const item: Listed = {
      seq: 1,
      name: "a.json",
      sha256: await sum('{"x":1}'),
    }
    expect(await get(mailbox, "brief", item)).toEqual({ x: 1 })
    await expect(
      get(mailbox, "brief", { ...item, sha256: "0".repeat(64) })
    ).rejects.toThrow("don't match")
  })

  it("puts with the token and says the answer", async () => {
    const { mailbox, calls } = fakeMailbox({})
    expect(
      (await put(mailbox, "brief", "rust-week-2026-w47.json", {})).status
    ).toBe(201)
    expect((await put(mailbox, "brief", "taken.json", {})).status).toBe(409)
    expect(calls[0]).toBe(
      "PUT https://mailbox.test/v1/brief/items/rust-week-2026-w47.json"
    )
  })

  it("reads the note a transcript's name carries", () => {
    expect(noteOfTranscript("transcript-note-311-12.json")).toBe("note-311")
    expect(noteOfTranscript("rust-week-2026-w46.json")).toBeNull()
  })
})
