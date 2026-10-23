import { createHash } from "node:crypto"
import type { Deps } from "@mailbox/core"
import {
  ARCHIVE_MIN_AGE_DAYS,
  handle,
  LIST_LIMIT_MAX,
  MAX_BODY_BYTES,
} from "@mailbox/core"
import type { Folder, Store } from "@mailbox/store"
import { describe, expect, it } from "vitest"

import { failing, memoryStore, untouchable } from "./stores"

const ROUTINE = "test-routine-token"
const HOME = "test-home-token"
const ARCHIVE = "test-archive-token"
const NOW = new Date("2026-10-21T14:52:00.000Z")

const DIGEST = JSON.stringify({ schema: "some-ui.job-digest/1", picks: [] })
const DECISIONS = JSON.stringify({
  schema: "some-ui.job-decisions/1",
  events: [],
})
const SCOUTS = JSON.stringify({ schema: "some-ui.job-scouts/1", scouts: [] })

const DIGEST_NAME = "digest-2026-10-21.json"
const DECISIONS_NAME = "decisions-2026-10-21.json"
const SCOUTS_NAME = "scouts-20261021T145200.json"

function deps(
  store: Store = memoryStore(),
  reported: Array<unknown> = []
): Deps {
  return {
    tokens: { routine: ROUTINE, home: HOME, archive: ARCHIVE },
    store,
    now: () => NOW,
    report: (error): void => {
      reported.push(error)
    },
  }
}

type Init = {
  readonly token?: string | null
  readonly body?: string
  readonly type?: string | null
  readonly headers?: Record<string, string>
}

function send(
  d: Deps,
  method: string,
  path: string,
  { token = ROUTINE, body, type = "application/json", headers = {} }: Init = {}
): Promise<Response> {
  const all = new Headers(headers)
  if (token !== null) all.set("authorization", `Bearer ${token}`)
  if (type !== null && body !== undefined) all.set("content-type", type)
  return handle(
    new Request(`https://mailbox.test${path}`, { method, headers: all, body }),
    d
  )
}

function put(
  d: Deps,
  folder: Folder,
  name: string,
  init: Init = {}
): Promise<Response> {
  return send(d, "PUT", `/v1/${folder}/items/${name}`, init)
}

async function json(response: Response): Promise<unknown> {
  return response.json()
}

/** A request whose body is a stream, with a count of how often it was pulled. */
function streamed(
  d: Deps,
  chunks: ReadonlyArray<Uint8Array>,
  headers: Record<string, string>
): { response: Promise<Response>; pulls: () => number } {
  const queue = [...chunks]
  let pulls = 0
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller): void {
        pulls += 1
        const next = queue.shift()
        if (next === undefined) controller.close()
        else controller.enqueue(next)
      },
    },
    { highWaterMark: 0 }
  )
  // `duplex` is not in Workers' RequestInit; Node requires it for a stream.
  const init = {
    method: "PUT",
    headers: {
      authorization: `Bearer ${ROUTINE}`,
      "content-type": "application/json",
      ...headers,
    },
    body,
    duplex: "half",
  }
  return {
    response: handle(
      new Request(`https://mailbox.test/v1/brief/items/${DIGEST_NAME}`, init),
      d
    ),
    pulls: () => pulls,
  }
}

describe("authentication", () => {
  it("a request without a token is refused before the store is touched", async () => {
    const { store, touched } = untouchable()
    const d = deps(store)
    for (const path of [
      "/v1/brief/items",
      `/v1/brief/items/${DIGEST_NAME}`,
      "/v1/nowhere",
      "/",
    ]) {
      const response = await send(d, "GET", path, { token: null })
      expect(response.status).toBe(401)
      expect(response.headers.get("www-authenticate")).toBe("Bearer")
      expect(await json(response)).toEqual({ error: "unauthorized" })
    }
    const put401 = await put(d, "brief", DIGEST_NAME, {
      token: null,
      body: DIGEST,
    })
    expect(put401.status).toBe(401)
    for (const header of [
      "Basic dGVzdA==",
      "Bearer",
      "Bearer ",
      "Bearer a b",
    ]) {
      const response = await send(d, "GET", "/v1/brief/items", {
        token: null,
        headers: { authorization: header },
      })
      expect(response.status).toBe(401)
    }
    expect(touched()).toBe(0)
  })

  it("a wrong token is refused", async () => {
    const { store, touched } = untouchable()
    const d = deps(store)
    for (const token of ["wrong", `${ROUTINE}x`, ROUTINE.slice(1), ""]) {
      const response = await send(d, "GET", "/v1/brief/items", { token })
      expect(response.status).toBe(401)
    }
    expect(touched()).toBe(0)
  })

  it("the scheme is case-insensitive and the token is exact", async () => {
    const d = deps()
    const response = await send(d, "GET", "/v1/brief/items", {
      token: null,
      headers: { authorization: `bearer ${ROUTINE}` },
    })
    expect(response.status).toBe(200)
  })

  it("a secret that is unset or empty authenticates no one", async () => {
    const { store, touched } = untouchable()
    const d: Deps = {
      ...deps(store),
      tokens: { routine: undefined, home: "", archive: undefined },
    }
    for (const token of ["", "undefined", "null", "empty"]) {
      const response = await send(d, "GET", "/v1/brief/items", { token })
      expect(response.status).toBe(401)
    }
    expect(touched()).toBe(0)
  })

  it("one secret set for two roles authenticates no one", async () => {
    const { store, touched } = untouchable()
    const shared = "test-shared-token"
    for (const tokens of [
      { routine: shared, home: shared, archive: ARCHIVE },
      { routine: ROUTINE, home: shared, archive: shared },
      { routine: shared, home: HOME, archive: shared },
    ]) {
      const d: Deps = { ...deps(store), tokens }
      for (const token of [shared, ROUTINE, HOME, ARCHIVE]) {
        const response = await send(d, "GET", "/v1/brief/items", { token })
        expect(response.status).toBe(401)
      }
    }
    expect(touched()).toBe(0)
  })
})

describe("roles", () => {
  it("the routine may put a digest and read every folder", async () => {
    const d = deps()
    expect(
      (
        await put(d, "decisions", DECISIONS_NAME, {
          token: HOME,
          body: DECISIONS,
        })
      ).status
    ).toBe(201)
    expect(
      (await put(d, "scout", SCOUTS_NAME, { token: HOME, body: SCOUTS })).status
    ).toBe(201)

    const added = await put(d, "brief", DIGEST_NAME, { body: DIGEST })
    expect(added.status).toBe(201)

    const held: ReadonlyArray<readonly [Folder, string]> = [
      ["brief", DIGEST_NAME],
      ["decisions", DECISIONS_NAME],
      ["scout", SCOUTS_NAME],
    ]
    for (const [folder, name] of held) {
      const listing = await send(d, "GET", `/v1/${folder}/items`)
      expect(listing.status).toBe(200)
      const item = await send(d, "GET", `/v1/${folder}/items/${name}`)
      expect(item.status).toBe(200)
    }
  })

  it("home may read brief and put decisions and scouts, and nothing else", async () => {
    const d = deps()
    expect((await put(d, "brief", DIGEST_NAME, { body: DIGEST })).status).toBe(
      201
    )

    expect(
      (await send(d, "GET", "/v1/brief/items", { token: HOME })).status
    ).toBe(200)
    expect(
      (await send(d, "GET", `/v1/brief/items/${DIGEST_NAME}`, { token: HOME }))
        .status
    ).toBe(200)
    expect(
      (
        await put(d, "decisions", DECISIONS_NAME, {
          token: HOME,
          body: DECISIONS,
        })
      ).status
    ).toBe(201)
    expect(
      (await put(d, "scout", SCOUTS_NAME, { token: HOME, body: SCOUTS })).status
    ).toBe(201)

    expect(
      (
        await put(d, "brief", "digest-2026-10-22.json", {
          token: HOME,
          body: DIGEST,
        })
      ).status
    ).toBe(403)
    for (const folder of ["decisions", "scout"] as const) {
      expect(
        (await send(d, "GET", `/v1/${folder}/items`, { token: HOME })).status
      ).toBe(403)
    }
    expect(
      (
        await send(d, "GET", `/v1/decisions/items/${DECISIONS_NAME}`, {
          token: HOME,
        })
      ).status
    ).toBe(403)
    expect(
      (await send(d, "GET", `/v1/scout/items/${SCOUTS_NAME}`, { token: HOME }))
        .status
    ).toBe(403)

    expect(
      (
        await put(d, "decisions", "decisions-2026-10-22.json", {
          body: DECISIONS,
        })
      ).status
    ).toBe(403)
    expect(
      (await put(d, "scout", "scouts-20261022T000000.json", { body: SCOUTS }))
        .status
    ).toBe(403)
  })
})

describe("names", () => {
  it("a name that breaks the folder's pattern is refused", async () => {
    const d = deps()
    const refused: ReadonlyArray<readonly [Folder, string, string]> = [
      ["brief", "digest-2026-10-21.txt", ROUTINE],
      ["brief", "digest-2026-10-21.json.bak", ROUTINE],
      ["brief", "digest-26-10-21.json", ROUTINE],
      ["brief", "digest-2026-10-21.json%0A", ROUTINE],
      ["brief", "Digest-2026-10-21.json", ROUTINE],
      ["brief", "..%2Fdigest-2026-10-21.json", ROUTINE],
      ["decisions", "decisions-2026-10-21-.json", HOME],
      ["decisions", "decisions-2026-10-21-x.json", HOME],
      ["decisions", "digest-2026-10-21.json", HOME],
      ["scout", "scouts-2026-10-21.json", HOME],
      ["scout", "scouts-20261021T14520.json", HOME],
      // Voice notes match no folder, on purpose.
      ["brief", "voice-2026-10-21.webm", ROUTINE],
      ["decisions", "decisions-2026-10-21-voice.json", HOME],
      ["scout", "scouts-20261021T145200.m4a", HOME],
    ]
    for (const [folder, name, token] of refused) {
      const body =
        folder === "brief"
          ? DIGEST
          : folder === "decisions"
            ? DECISIONS
            : SCOUTS
      const response = await put(d, folder, name, { token, body })
      expect([folder, name, response.status]).toEqual([folder, name, 422])
    }
  })

  it("the decisions folder takes a numbered second file for a day", async () => {
    const d = deps()
    for (const name of [
      "decisions-2026-10-21.json",
      "decisions-2026-10-21-2.json",
      "decisions-2026-10-21-13.json",
    ]) {
      expect(
        (await put(d, "decisions", name, { token: HOME, body: DECISIONS }))
          .status
      ).toBe(201)
    }
  })
})

describe("bodies", () => {
  it("a body whose schema does not match its folder is refused", async () => {
    const d = deps()
    const wrong: ReadonlyArray<string> = [
      DECISIONS, // another folder's schema
      JSON.stringify({ schema: "some-ui.job-digest/2" }),
      JSON.stringify({ picks: [] }),
      JSON.stringify([{ schema: "some-ui.job-digest/1" }]),
      JSON.stringify({ schema: ["some-ui.job-digest/1"] }),
      "null",
      '"some-ui.job-digest/1"',
    ]
    for (const body of wrong) {
      const response = await put(d, "brief", DIGEST_NAME, { body })
      expect([body, response.status]).toEqual([body, 422])
    }
    expect(
      (await put(d, "scout", SCOUTS_NAME, { token: HOME, body: DIGEST })).status
    ).toBe(422)
    expect(
      (await put(d, "decisions", DECISIONS_NAME, { token: HOME, body: SCOUTS }))
        .status
    ).toBe(422)
  })

  it("a body that is not JSON, or not application/json, is refused", async () => {
    const d = deps()
    expect((await put(d, "brief", DIGEST_NAME, { body: "{" })).status).toBe(422)
    expect((await put(d, "brief", DIGEST_NAME, { body: "" })).status).toBe(422)
    expect(
      (await put(d, "brief", DIGEST_NAME, { body: DIGEST, type: "text/plain" }))
        .status
    ).toBe(422)
    expect(
      (await put(d, "brief", DIGEST_NAME, { body: DIGEST, type: null })).status
    ).toBe(422)
    expect(
      (await put(d, "brief", DIGEST_NAME, { body: `\uFEFF${DIGEST}` })).status
    ).toBe(422)
    const ok = await put(d, "brief", DIGEST_NAME, {
      body: DIGEST,
      type: "Application/JSON; charset=utf-8",
    })
    expect(ok.status).toBe(201)
  })

  it("a body that is not UTF-8 is refused", async () => {
    const d = deps()
    const response = await handle(
      new Request(`https://mailbox.test/v1/brief/items/${DIGEST_NAME}`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${ROUTINE}`,
          "content-type": "application/json",
        },
        body: new Uint8Array([0x7b, 0xff, 0x7d]),
      }),
      d
    )
    expect(response.status).toBe(422)
  })

  it("a body over the cap is refused before it is read", async () => {
    const { store, touched } = untouchable()
    const d = deps(store)
    // Declares one byte too many, and the stream is never pulled.
    const { response, pulls } = streamed(d, [new Uint8Array(10)], {
      "content-length": String(MAX_BODY_BYTES + 1),
    })
    const big = await response
    expect(big.status).toBe(413)
    expect(await json(big)).toEqual({ error: "too_big" })
    expect(pulls()).toBe(0)
    expect(touched()).toBe(0)
  })

  it("a body that declares no length is cut off at the cap", async () => {
    const { store, touched } = untouchable()
    const d = deps(store)
    const chunk = new Uint8Array(MAX_BODY_BYTES / 2)
    const { response, pulls } = streamed(
      d,
      Array.from({ length: 100 }, () => chunk),
      {}
    )
    expect((await response).status).toBe(413)
    // Two chunks make exactly the cap, the third passes it: it stops there.
    expect(pulls()).toBe(3)
    expect(touched()).toBe(0)
  })

  it("a body of exactly the cap is read, and one byte more is not", async () => {
    const d = deps()
    const shell = JSON.stringify({ schema: "some-ui.job-digest/1", f: "" })
    const at = (extra: number): string =>
      JSON.stringify({
        schema: "some-ui.job-digest/1",
        f: "x".repeat(MAX_BODY_BYTES - shell.length + extra),
      })
    // ASCII, so a character is a byte.
    expect(at(0)).toHaveLength(MAX_BODY_BYTES)
    expect((await put(d, "brief", DIGEST_NAME, { body: at(0) })).status).toBe(
      201
    )
    const over = await put(d, "brief", "digest-2026-10-22.json", {
      body: at(1),
    })
    expect(over.status).toBe(413)
  })
})

describe("keeping a file", () => {
  it("the same bytes twice answer unchanged", async () => {
    const d = deps()
    const first = await put(d, "brief", DIGEST_NAME, { body: DIGEST })
    expect(first.status).toBe(201)
    const added = await json(first)
    expect(added).toEqual({ change: "added", seq: 1 })

    const again = await put(d, "brief", DIGEST_NAME, { body: DIGEST })
    expect(again.status).toBe(200)
    expect(await json(again)).toEqual({ change: "unchanged", seq: 1 })
  })

  it("different bytes under a held name answer conflict", async () => {
    const d = deps()
    await put(d, "brief", DIGEST_NAME, { body: DIGEST })
    const other = JSON.stringify({ schema: "some-ui.job-digest/1", picks: [1] })
    const conflict = await put(d, "brief", DIGEST_NAME, { body: other })
    expect(conflict.status).toBe(409)
    expect(await json(conflict)).toEqual({ error: "conflict" })
  })

  it("an item reads back as the exact bytes sent, with its hash as the ETag", async () => {
    const d = deps()
    const body = `{ "schema" : "some-ui.job-digest/1",\n  "picks": [ ] }\n`
    await put(d, "brief", DIGEST_NAME, { body })
    const response = await send(d, "GET", `/v1/brief/items/${DIGEST_NAME}`)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(body)
    expect(response.headers.get("content-type")).toBe("application/json")
    const sha256 = createHash("sha256").update(body).digest("hex")
    expect(response.headers.get("etag")).toBe(`"${sha256}"`)
    expect(response.headers.get("cache-control")).toBe("no-store")
  })

  it("an item that is not there is not found", async () => {
    const d = deps()
    for (const name of [DIGEST_NAME, "not-a-digest.json"]) {
      const response = await send(d, "GET", `/v1/brief/items/${name}`)
      expect(response.status).toBe(404)
      expect(await json(response)).toEqual({ error: "not_found" })
    }
  })
})

describe("listing", () => {
  const days = ["17", "18", "19", "20", "21"]

  async function filled(): Promise<Deps> {
    const d = deps()
    for (const day of days) {
      await put(d, "brief", `digest-2026-10-${day}.json`, { body: DIGEST })
    }
    // Another folder's items must never appear in brief's listing.
    await put(d, "decisions", DECISIONS_NAME, { token: HOME, body: DECISIONS })
    return d
  }

  type Entry = { readonly seq: number; readonly name: string }

  function isListing(value: unknown): value is { items: Array<Entry> } {
    return (
      typeof value === "object" &&
      value !== null &&
      "items" in value &&
      Array.isArray(value.items) &&
      value.items.every(
        (item: unknown) =>
          typeof item === "object" &&
          item !== null &&
          "seq" in item &&
          typeof item.seq === "number" &&
          "name" in item &&
          typeof item.name === "string"
      )
    )
  }

  async function page(d: Deps, query: string): Promise<ReadonlyArray<Entry>> {
    const response = await send(d, "GET", `/v1/brief/items${query}`)
    expect(response.status).toBe(200)
    const body = await json(response)
    if (!isListing(body)) throw new Error("not a listing")
    return body.items
  }

  function lastSeq(entries: ReadonlyArray<Entry>): number {
    const last = entries.at(-1)
    if (last === undefined) throw new Error("an empty page has no last item")
    return last.seq
  }

  it("a listing forwards after and limit, within its own folder", async () => {
    const d = await filled()
    const first = await page(d, "?limit=2")
    expect(first.map((i) => i.name)).toEqual([
      "digest-2026-10-17.json",
      "digest-2026-10-18.json",
    ])
    const second = await page(d, `?after=${lastSeq(first)}&limit=2`)
    expect(second.map((i) => i.name)).toEqual([
      "digest-2026-10-19.json",
      "digest-2026-10-20.json",
    ])
    expect((await page(d, "")).length).toBe(5)
  })

  it("a listing carries metadata only", async () => {
    const d = await filled()
    const response = await send(d, "GET", "/v1/brief/items?limit=1")
    const sha256 = createHash("sha256").update(DIGEST).digest("hex")
    expect(await json(response)).toEqual({
      items: [
        {
          seq: 1,
          name: "digest-2026-10-17.json",
          size: DIGEST.length,
          sha256,
          contentType: "application/json",
          putAt: NOW.toISOString(),
          liveSince: NOW.toISOString(),
        },
      ],
    })
  })

  it("a limit or cursor that is not a whole number in range is refused", async () => {
    const d = await filled()
    for (const query of [
      "?limit=0",
      `?limit=${LIST_LIMIT_MAX + 1}`,
      "?limit=-1",
      "?limit=two",
      "?limit=",
      "?after=-1",
      "?after=1.5",
      "?after=x",
    ]) {
      const response = await send(d, "GET", `/v1/brief/items${query}`)
      expect([query, response.status]).toEqual([query, 422])
    }
  })
})

describe("routes", () => {
  it("anything else is not found, and a wrong method is not allowed", async () => {
    const d = deps()
    for (const path of [
      "/",
      "/v1",
      "/v1/brief",
      "/v1/brief/items/",
      "/v2/brief/items",
      "/v1/voice/items",
      "/v1/brief/other",
      `/v1/brief/items/${DIGEST_NAME}/extra`,
      `/v1/brief/archived/${DIGEST_NAME}`,
      "/v1/brief/wanted/",
      "/v1/voice/wanted",
    ]) {
      const response = await send(d, "GET", path)
      expect([path, response.status]).toEqual([path, 404])
    }

    const onListing = await send(d, "PUT", "/v1/brief/items", { body: DIGEST })
    expect(onListing.status).toBe(405)
    expect(onListing.headers.get("allow")).toBe("GET")
    for (const method of ["POST", "PATCH", "HEAD", "OPTIONS"]) {
      const response = await send(d, method, `/v1/brief/items/${DIGEST_NAME}`)
      expect([method, response.status]).toEqual([method, 405])
      expect(response.headers.get("allow")).toBe("GET, PUT, DELETE")
    }
    for (const [method, path, allow] of [
      ["PUT", "/v1/brief/archived", "GET"],
      ["PUT", "/v1/brief/wanted", "GET"],
      ["GET", `/v1/brief/wanted/${DIGEST_NAME}`, "PUT"],
      ["DELETE", `/v1/brief/wanted/${DIGEST_NAME}`, "PUT"],
    ] as const) {
      const response = await send(d, method, path)
      expect([method, path, response.status]).toEqual([method, path, 405])
      expect(response.headers.get("allow")).toBe(allow)
    }
  })
})

describe("archiving", () => {
  const DAY = 86_400_000
  const DIGEST_SHA = createHash("sha256").update(DIGEST).digest("hex")
  /** When `at(ARCHIVE_MIN_AGE_DAYS)` sets the clock. */
  const OLD_ENOUGH = new Date(
    NOW.getTime() + ARCHIVE_MIN_AGE_DAYS * DAY
  ).toISOString()

  /** A mailbox holding today's digest, and a clock the test moves. */
  async function held(): Promise<{ d: Deps; at: (days: number) => void }> {
    let now = NOW
    const d: Deps = { ...deps(), now: () => now }
    expect((await put(d, "brief", DIGEST_NAME, { body: DIGEST })).status).toBe(
      201
    )
    return {
      d,
      at: (days): void => {
        now = new Date(NOW.getTime() + days * DAY)
      },
    }
  }

  function archive(
    d: Deps,
    { token = ARCHIVE, sha = DIGEST_SHA, name = DIGEST_NAME } = {}
  ): Promise<Response> {
    return send(d, "DELETE", `/v1/brief/items/${name}`, {
      token,
      headers: { "if-match": `"${sha}"` },
    })
  }

  it("the archive role reads every folder, archives and puts back, and puts nothing new", async () => {
    const { d, at } = await held()
    for (const folder of ["brief", "decisions", "scout"]) {
      expect(
        (await send(d, "GET", `/v1/${folder}/items`, { token: ARCHIVE })).status
      ).toBe(200)
      expect(
        (await send(d, "GET", `/v1/${folder}/wanted`, { token: ARCHIVE }))
          .status
      ).toBe(200)
    }
    // A put of a name never archived adds nothing.
    expect(
      (
        await put(d, "brief", "digest-2026-10-22.json", {
          token: ARCHIVE,
          body: DIGEST,
        })
      ).status
    ).toBe(404)
    expect(
      (
        await send(d, "PUT", `/v1/brief/wanted/${DIGEST_NAME}`, {
          token: ARCHIVE,
        })
      ).status
    ).toBe(403)

    at(ARCHIVE_MIN_AGE_DAYS)
    for (const token of [ROUTINE, HOME]) {
      expect((await archive(d, { token })).status).toBe(403)
    }
    expect((await archive(d)).status).toBe(200)
  })

  it("only the routine lists what is archived and asks for it back", async () => {
    const { d } = await held()
    for (const token of [HOME, ARCHIVE]) {
      expect(
        (await send(d, "GET", "/v1/brief/archived", { token })).status
      ).toBe(403)
    }
    expect(
      (await send(d, "PUT", `/v1/brief/wanted/${DIGEST_NAME}`, { token: HOME }))
        .status
    ).toBe(403)
    for (const token of [ROUTINE, HOME]) {
      expect((await send(d, "GET", "/v1/brief/wanted", { token })).status).toBe(
        403
      )
    }
  })

  it("an archive names the bytes it drops, and waits until the item is old enough", async () => {
    const { d, at } = await held()
    const noTag = await send(d, "DELETE", `/v1/brief/items/${DIGEST_NAME}`, {
      token: ARCHIVE,
    })
    expect(noTag.status).toBe(428)
    for (const tag of [
      DIGEST_SHA,
      `"${DIGEST_SHA.toUpperCase()}"`,
      '"abc"',
      "*",
    ]) {
      const response = await send(
        d,
        "DELETE",
        `/v1/brief/items/${DIGEST_NAME}`,
        { token: ARCHIVE, headers: { "if-match": tag } }
      )
      expect([tag, response.status]).toEqual([tag, 428])
    }
    expect((await archive(d, { sha: "0".repeat(64) })).status).toBe(412)
    expect((await archive(d, { name: "digest-2026-10-22.json" })).status).toBe(
      404
    )
    expect((await archive(d, { name: "voice-1.m4a" })).status).toBe(404)

    at(ARCHIVE_MIN_AGE_DAYS - 1)
    expect((await archive(d)).status).toBe(422)
    at(ARCHIVE_MIN_AGE_DAYS)
    const done = await archive(d)
    expect([done.status, await json(done)]).toEqual([
      200,
      { change: "archived" },
    ])
    const again = await archive(d)
    expect([again.status, await json(again)]).toEqual([
      200,
      { change: "unchanged" },
    ])
  })

  it("an archived item reads as gone, is listed as archived, and its name stays held", async () => {
    const { d, at } = await held()
    at(ARCHIVE_MIN_AGE_DAYS)
    await archive(d)
    const archivedAt = OLD_ENOUGH

    const gone = await send(d, "GET", `/v1/brief/items/${DIGEST_NAME}`)
    expect([gone.status, await json(gone)]).toEqual([
      410,
      { error: "archived", archivedAt },
    ])
    expect(await json(await send(d, "GET", "/v1/brief/items"))).toEqual({
      items: [],
    })
    expect(await json(await send(d, "GET", "/v1/brief/archived"))).toEqual({
      items: [
        {
          seq: 1,
          name: DIGEST_NAME,
          size: DIGEST.length,
          sha256: DIGEST_SHA,
          contentType: "application/json",
          putAt: NOW.toISOString(),
          archivedAt,
        },
      ],
    })
    expect((await put(d, "brief", DIGEST_NAME, { body: DIGEST })).status).toBe(
      200
    )
    const other = JSON.stringify({ schema: "some-ui.job-digest/1", picks: [1] })
    expect((await put(d, "brief", DIGEST_NAME, { body: other })).status).toBe(
      409
    )
  })

  it("an ask is answered by home putting the same bytes back", async () => {
    const { d, at } = await held()
    const ask = (): Promise<Response> =>
      send(d, "PUT", `/v1/brief/wanted/${DIGEST_NAME}`)
    const answered = async (response: Response): Promise<unknown> => [
      response.status,
      await json(response),
    ]

    expect(await answered(await ask())).toEqual([200, { change: "live" }])
    expect(
      (await send(d, "PUT", "/v1/brief/wanted/digest-2026-10-22.json")).status
    ).toBe(404)
    expect((await send(d, "PUT", "/v1/brief/wanted/voice.m4a")).status).toBe(
      404
    )
    at(ARCHIVE_MIN_AGE_DAYS)
    await archive(d)
    expect(await answered(await ask())).toEqual([202, { change: "asked" }])
    expect(await answered(await ask())).toEqual([200, { change: "unchanged" }])
    const askedAt = OLD_ENOUGH
    expect(
      await json(await send(d, "GET", "/v1/brief/wanted", { token: ARCHIVE }))
    ).toEqual({ items: [{ name: DIGEST_NAME, askedAt }] })

    // Other bytes, or a body no put would take, never go back.
    const other = JSON.stringify({ schema: "some-ui.job-digest/1", picks: [1] })
    expect(
      (await put(d, "brief", DIGEST_NAME, { token: ARCHIVE, body: other }))
        .status
    ).toBe(409)
    expect(
      (await put(d, "brief", DIGEST_NAME, { token: ARCHIVE, body: SCOUTS }))
        .status
    ).toBe(422)

    at(ARCHIVE_MIN_AGE_DAYS + 1)
    const back = await put(d, "brief", DIGEST_NAME, {
      token: ARCHIVE,
      body: DIGEST,
    })
    expect(await answered(back)).toEqual([201, { change: "restored", seq: 2 }])
    expect(
      await json(await send(d, "GET", "/v1/brief/wanted", { token: ARCHIVE }))
    ).toEqual({ items: [] })
    const read = await send(d, "GET", `/v1/brief/items/${DIGEST_NAME}`)
    expect([read.status, await read.text()]).toEqual([200, DIGEST])
    const again = await put(d, "brief", DIGEST_NAME, {
      token: ARCHIVE,
      body: DIGEST,
    })
    expect(await answered(again)).toEqual([
      200,
      { change: "unchanged", seq: 2 },
    ])

    // Counted from its return, so it does not go straight home again.
    at(ARCHIVE_MIN_AGE_DAYS * 2)
    expect((await archive(d)).status).toBe(422)
  })
})

describe("when storage fails", () => {
  it("answers 503 as JSON, tells the logger, and shows nothing of the failure", async () => {
    const reported: Array<unknown> = []
    const error = new Error(
      "D1_ERROR: daily limit reached for test-secret-detail"
    )
    const d = deps(failing(error), reported)
    const response = await send(d, "GET", "/v1/brief/items")
    expect(response.status).toBe(503)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({ error: "unavailable" })
    expect(text).not.toContain("test-secret-detail")
    expect(reported).toEqual([error])

    const written = await put(d, "brief", DIGEST_NAME, { body: DIGEST })
    expect(written.status).toBe(503)
    expect(reported).toHaveLength(2)
  })
})
