import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type { Deps } from "@mailbox/core"
import {
  ARCHIVE_MIN_AGE_DAYS,
  handle,
  LIST_LIMIT_MAX,
  MAX_BODY_BYTES,
  ringMessage,
  RINGS,
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

/** A bell that records what rang; Node cannot answer `101`, so listening answers `200`. */
function recordingBell(rings: Array<Folder> = []): Deps["bell"] {
  return {
    listen: (): Promise<Response> =>
      Promise.resolve(new Response("listening", { status: 200 })),
    ring: (folder): void => {
      rings.push(folder)
    },
  }
}

function deps(
  store: Store = memoryStore(),
  reported: Array<unknown> = [],
  rings: Array<Folder> = []
): Deps {
  return {
    tokens: { routine: ROUTINE, home: HOME, archive: ARCHIVE },
    store,
    now: () => NOW,
    report: (error): void => {
      reported.push(error)
    },
    bell: recordingBell(rings),
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

  it("home may read brief, not decisions or scouts, and put only decisions and scouts", async () => {
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

describe("the routine's backfill of files only Drive holds (MB2)", () => {
  const OLD_DECISIONS = "decisions-2026-10-20.json"
  const OLD_SCOUTS = "scouts-20261022T235959.json"

  it("the routine puts a decisions or scouts file only Drive holds in brief, once, and home reads it", async () => {
    const d = deps()
    // The days from the phone's first share (2026-10-17) to the last before
    // it filed every Jobs file home (DRIVE_ONLY_ENDED, 2026-11-04).
    for (const [name, body] of [
      [OLD_DECISIONS, DECISIONS],
      ["decisions-2026-10-17.json", DECISIONS],
      ["decisions-2026-10-20-2.json", DECISIONS],
      ["decisions-2026-10-22-99.json", DECISIONS],
      ["decisions-2026-10-23.json", DECISIONS],
      ["decisions-2026-10-26-5.json", DECISIONS],
      ["decisions-2026-11-03.json", DECISIONS],
      ["scouts-20261017T000000.json", SCOUTS],
      [OLD_SCOUTS, SCOUTS],
      ["scouts-20261103T235959.json", SCOUTS],
    ] as const) {
      expect([name, (await put(d, "brief", name, { body })).status]).toEqual([
        name,
        201,
      ])
      expect((await put(d, "brief", name, { body })).status).toBe(200)
      const read = await send(d, "GET", `/v1/brief/items/${name}`, {
        token: HOME,
      })
      expect(read.status).toBe(200)
      expect(await read.text()).toBe(body)
    }
    expect(
      (
        await put(d, "brief", OLD_DECISIONS, {
          body: JSON.stringify({ schema: "some-ui.job-decisions/1", x: 1 }),
        })
      ).status
    ).toBe(409)
  })

  it("takes only a name the phone could have written before it filed every Jobs file home, and holds each to its own schema", async () => {
    const d = deps()
    for (const [name, body] of [
      // From the day the phone files every Jobs file home.
      ["decisions-2026-11-04.json", DECISIONS],
      ["decisions-2026-11-09-3.json", DECISIONS],
      ["scouts-20261104T000000.json", SCOUTS],
      // Before the phone could share one, or in no year it could.
      ["decisions-2026-10-16.json", DECISIONS],
      ["scouts-20261016T235959.json", SCOUTS],
      ["decisions-2025-10-20.json", DECISIONS],
      ["decisions-0000-00-00-99999.json", DECISIONS],
      // No day on the calendar, or no time on the clock.
      ["decisions-2026-09-99.json", DECISIONS],
      ["decisions-2026-02-30.json", DECISIONS],
      ["decisions-2026-10-00.json", DECISIONS],
      ["scouts-20261020T240000.json", SCOUTS],
      ["scouts-20261020T126000.json", SCOUTS],
      // A share number the phone never writes.
      ["decisions-2026-10-20-1.json", DECISIONS],
      ["decisions-2026-10-20-02.json", DECISIONS],
      ["decisions-2026-10-20-100.json", DECISIONS],
      // Not a decisions or scouts name at all.
      ["decision-2026-10-20.json", DECISIONS],
      ["decisions-2026-10-20.webm", DECISIONS],
      ["2026-10-20_sw-0001_voice-1.webm", DECISIONS],
    ] as const) {
      const response = await put(d, "brief", name, { body })
      expect([name, response.status]).toEqual([name, 422])
      expect(await json(response)).toEqual({
        error: "the name does not fit this folder",
      })
    }
    for (const [name, body, schema] of [
      [OLD_DECISIONS, SCOUTS, "some-ui.job-decisions/1"],
      [OLD_SCOUTS, DIGEST, "some-ui.job-scouts/1"],
      ["digest-2026-10-20.json", DECISIONS, "some-ui.job-digest/1"],
    ] as const) {
      const response = await put(d, "brief", name, { body })
      expect([name, response.status]).toEqual([name, 422])
      expect(await json(response)).toEqual({
        error: `the body's schema must be ${schema}`,
      })
    }
  })

  it("only the routine puts one, and only in brief", async () => {
    const d = deps()
    // Home may not put in brief; the archive role's put only restores.
    for (const [token, status] of [
      [HOME, 403],
      [ARCHIVE, 404],
    ] as const) {
      expect(
        (await put(d, "brief", OLD_DECISIONS, { token, body: DECISIONS }))
          .status
      ).toBe(status)
    }
    // The phone's folders take the phone's files, from home only.
    expect(
      (await put(d, "decisions", OLD_DECISIONS, { body: DECISIONS })).status
    ).toBe(403)
  })
})

describe("a week of Rust Rounds rides brief (MB2, RR12)", () => {
  const WEEK = JSON.stringify({
    schema: "some-ui.rust-week/1",
    id: "2026-w46",
    tickets: [{ id: "QM-311", program: "fn main() {}\n" }],
  })
  const NAME = "rust-week-2026-w46.json"

  it("the routine puts one in brief, and home reads it with the digests", async () => {
    const d = deps()
    expect((await put(d, "brief", NAME, { body: WEEK })).status).toBe(201)
    const read = await send(d, "GET", `/v1/brief/items/${NAME}`, {
      token: HOME,
    })
    expect(await read.text()).toBe(WEEK)
    const listed = await send(d, "GET", "/v1/brief/items", { token: HOME })
    expect(await json(listed)).toMatchObject({
      items: [expect.objectContaining({ name: NAME })],
    })
  })

  it("refuses a week whose name is not its id's, or another schema", async () => {
    const d = deps()
    const misnamed = await put(d, "brief", "rust-week-2026-w47.json", {
      body: WEEK,
    })
    expect(await json(misnamed)).toEqual({
      error: "the name must carry the week's id",
    })
    const noId = await put(d, "brief", NAME, {
      body: JSON.stringify({ schema: "some-ui.rust-week/1", id: "week-46" }),
    })
    expect(await json(noId)).toEqual({
      error: "id must be the week's, like 2026-w46",
    })
    const wrong = await put(d, "brief", NAME, { body: DIGEST })
    expect(await json(wrong)).toEqual({
      error: "the body's schema must be some-ui.rust-week/1",
    })
    expect(
      (await put(d, "brief", "rust-week-2026-46.json", { body: WEEK })).status
    ).toBe(422)
  })
})

describe("a week of mock interview rides brief (MB2, IW4)", () => {
  const week = (fields: Record<string, unknown> = {}): string =>
    JSON.stringify({
      schema: "some-ui.interview-week/1",
      id: "2026-w47",
      questions: [{ id: "conflict" }, { id: "decision-c266" }],
      cards: [{ id: "invariant-rs1" }],
      ...fields,
    })
  const NAME = "interview-week-2026-w47.json"

  it("the routine puts one in brief, and home reads it with the digests", async () => {
    const d = deps()
    expect((await put(d, "brief", NAME, { body: week() })).status).toBe(201)
    const read = await send(d, "GET", `/v1/brief/items/${NAME}`, {
      token: HOME,
    })
    expect(await read.text()).toBe(week())
  })

  it("refuses a week whose name isn't its id's, or whose ids a take's ref can't name", async () => {
    const refused = async (body: string, name = NAME): Promise<unknown> =>
      json(await put(deps(), "brief", name, { body }))
    expect(await refused(week(), "interview-week-2026-w48.json")).toEqual({
      error: "the name must carry the week's id",
    })
    expect(await refused(week({ id: "2026-W47" }))).toEqual({
      error: "id must be the week's, like 2026-w47",
    })
    expect(await refused(week({ questions: [{ id: "read" }] }))).toEqual({
      error: "no question may be named read",
    })
    // A card may be named read: its ref is <week>:read:<card>.
    expect(
      (
        await put(deps(), "brief", NAME, {
          body: week({ cards: [{ id: "read" }] }),
        })
      ).status
    ).toBe(201)
    const slug = {
      error: "each card's id must be a kebab slug of at most 64 characters",
    }
    for (const id of ["Rs1", "a--b", "-a", "x".repeat(65), 7]) {
      expect(await refused(week({ cards: [{ id }] }))).toEqual(slug)
    }
    expect(
      await refused(week({ questions: [{ id: "a" }, { id: "a" }] }))
    ).toEqual({ error: "each question's id is used once" })
    expect(await refused(week({ cards: undefined }))).toEqual({
      error: "cards must be a list",
    })
    expect(await refused(DIGEST)).toEqual({
      error: "the body's schema must be some-ui.interview-week/1",
    })
    expect(
      (
        await put(deps(), "brief", "interview-week-2026-47.json", {
          body: week(),
        })
      ).status
    ).toBe(422)
  })
})

describe("a Rust Rounds essay's script rides brief (MB2, RR16)", () => {
  const essay = (week: string): string =>
    JSON.stringify({
      schema: "some-ui.rust-essay/1",
      week: { id: week, from: "2026-11-09", to: "2026-11-15" },
      tickets: [],
    })
  const ESSAY = essay("2026-w46")
  const NAME = "rust-essay-2026-w46.json"

  it("the routine puts one in brief, home reads it with the digests, and it rings", async () => {
    const rings: Array<Folder> = []
    const d = deps(memoryStore(), [], rings)
    expect((await put(d, "brief", NAME, { body: ESSAY })).status).toBe(201)
    expect(rings).toEqual(["brief"])
    const read = await send(d, "GET", `/v1/brief/items/${NAME}`, {
      token: HOME,
    })
    expect(await read.text()).toBe(ESSAY)
    const listed = await send(d, "GET", "/v1/brief/items", { token: HOME })
    expect(await json(listed)).toMatchObject({
      items: [expect.objectContaining({ name: NAME })],
    })
    expect(
      (await put(d, "brief", NAME, { body: ESSAY, token: HOME })).status
    ).toBe(403)
  })

  it("takes a correction as -r2 and on, never -r1 or -r0", async () => {
    const d = deps()
    for (const name of [
      "rust-essay-2026-w46-r2.json",
      "rust-essay-2026-w46-r10.json",
    ]) {
      const response = await put(d, "brief", name, { body: ESSAY })
      expect([name, response.status]).toEqual([name, 201])
    }
    for (const name of [
      "rust-essay-2026-w46-r1.json",
      "rust-essay-2026-w46-r0.json",
      "rust-essay-2026-w46-r02.json",
      "rust-essay-2026-w46-r.json",
    ]) {
      const response = await put(d, "brief", name, { body: ESSAY })
      expect([name, response.status]).toEqual([name, 422])
    }
  })

  it("refuses an essay whose name is not its week's, or another schema", async () => {
    const d = deps()
    for (const name of [
      "rust-essay-2026-w47.json",
      "rust-essay-2026-w47-r2.json",
    ]) {
      const misnamed = await put(d, "brief", name, { body: ESSAY })
      expect(await json(misnamed)).toEqual({
        error: "the name must carry the week's id",
      })
    }
    for (const body of [
      essay("week-46"),
      JSON.stringify({ schema: "some-ui.rust-essay/1", week: "2026-w46" }),
      JSON.stringify({ schema: "some-ui.rust-essay/1" }),
    ]) {
      expect(await json(await put(d, "brief", NAME, { body }))).toEqual({
        error: "week.id must be the week's, like 2026-w46",
      })
    }
    const wrong = await put(d, "brief", NAME, { body: DIGEST })
    expect(await json(wrong)).toEqual({
      error: "the body's schema must be some-ui.rust-essay/1",
    })
    expect(
      (await put(d, "brief", "rust-essay-2026-46.json", { body: ESSAY })).status
    ).toBe(422)
  })
})

describe("the build-journal session's list of the takes Drive holds (MB2, HF11)", () => {
  const SHA_A = "a".repeat(64)
  const SHA_B = `${"0123456789abcdef".repeat(4)}`
  const LIST = {
    schema: "some-ui.drive-takes/1",
    at: "2026-11-01T09:15:00.000Z",
    takes: [{ sha256: SHA_A }, { sha256: SHA_B }],
  }
  const NAME = "drive-takes-20261101T091500Z.json"

  it("the routine puts one in brief, once, and home reads it there", async () => {
    const d = deps()
    const body = JSON.stringify(LIST)
    expect((await put(d, "brief", NAME, { body })).status).toBe(201)
    expect((await put(d, "brief", NAME, { body })).status).toBe(200)
    expect(
      (
        await put(d, "brief", NAME, {
          body: JSON.stringify({ ...LIST, takes: [] }),
        })
      ).status
    ).toBe(409)
    const read = await send(d, "GET", `/v1/brief/items/${NAME}`, {
      token: HOME,
    })
    expect(read.status).toBe(200)
    expect(await read.text()).toBe(body)
    // Home lists it with the digests, so it needs no listing of its own.
    const listed = await send(d, "GET", "/v1/brief/items", { token: HOME })
    expect(await json(listed)).toMatchObject({
      items: [expect.objectContaining({ name: NAME })],
    })
    // A folder the phone puts in does not take its name.
    expect(
      (await put(d, "decisions", NAME, { token: HOME, body })).status
    ).toBe(422)
  })

  it("takes an empty list: Drive holds no takes yet", async () => {
    const d = deps()
    const body = JSON.stringify({ ...LIST, takes: [] })
    expect((await put(d, "brief", NAME, { body })).status).toBe(201)
  })

  it("takes only SHA-256s and when Drive was listed: no audio, no Drive file or link", async () => {
    const d = deps()
    const shapes: ReadonlyArray<readonly [unknown, string]> = [
      [
        { ...LIST, audio: "UklGRg==" },
        "a list of takes carries no audio: Drive and home keep it",
      ],
      [
        { ...LIST, driveFolder: "x" },
        "a list of takes names no Drive file or link",
      ],
      [{ ...LIST, folder: "takes" }, "folder is not part of a list of takes"],
      [
        { ...LIST, takes: [{ sha256: SHA_A, fileId: "1AbC" }] },
        "a list of takes names no Drive file or link",
      ],
      [
        { ...LIST, takes: [{ sha256: SHA_A, name: "take.webm" }] },
        "name is not part of a take: only its sha256",
      ],
      [
        { ...LIST, takes: [{ sha256: SHA_A, bytes: 3 }] },
        "a list of takes carries no audio: Drive and home keep it",
      ],
      [
        {
          ...LIST,
          takes: [{ sha256: SHA_A }],
          note: "https://drive.google.com/file/d/1AbC",
        },
        "a list of takes names no Drive file or link",
      ],
      [
        { ...LIST, takes: [{ sha256: SHA_A.toUpperCase() }] },
        "sha256 must be the recording's SHA-256, in lower-case hex",
      ],
      [
        { ...LIST, takes: [{ sha256: "a".repeat(63) }] },
        "sha256 must be the recording's SHA-256, in lower-case hex",
      ],
      [{ ...LIST, takes: [SHA_A] }, "each take must be an object"],
      [
        { ...LIST, takes: [{ sha256: SHA_A }, { sha256: SHA_A }] },
        "each take is named once",
      ],
      [{ ...LIST, takes: { sha256: SHA_A } }, "takes must be a list"],
      [{ ...LIST, at: "today" }, "at must be when Drive's takes were listed"],
      [
        { ...LIST, at: "2026-11-01T09:15:01.000Z" },
        "the name must carry when Drive's takes were listed, in UTC",
      ],
      [
        {
          ...LIST,
          takes: Array.from({ length: 10_001 }, (_, n) => ({
            sha256: n.toString(16).padStart(64, "0"),
          })),
        },
        "takes may name at most 10000",
      ],
    ]
    for (const [body, why] of shapes) {
      const answer = await put(d, "brief", NAME, { body: JSON.stringify(body) })
      expect([why, answer.status]).toEqual([why, 422])
      expect(await json(answer)).toEqual({ error: why })
    }
    for (const name of [
      "drive-takes-20261101T091500.json",
      "drive-takes-2026-11-01.json",
      "drive-takes-20261101T091500Z.webm",
      "takes-20261101T091500Z.json",
    ]) {
      const answer = await put(d, "brief", name, {
        body: JSON.stringify(LIST),
      })
      expect([name, answer.status]).toEqual([name, 422])
    }
    const wrong = await put(d, "brief", NAME, { body: DIGEST })
    expect(await json(wrong)).toEqual({
      error: "the body's schema must be some-ui.drive-takes/1",
    })
  })

  it("refuses a key given twice, whose first value JSON.parse would drop unread", async () => {
    const d = deps()
    const take = (inner: string): string =>
      `{"schema":"${LIST.schema}","at":"${LIST.at}","takes":[${inner}]}`
    // A Drive id under a key the last value then hides, in a take and at the top.
    for (const body of [
      take(`{"sha256":"1AbCdEfGhIjKlMnOp","sha256":"${SHA_A}"}`),
      take(`{"sha256":12345,"sha256":"${SHA_A}"}`),
      take(String.raw`{"sh\u0061256":"1AbC","sha256":"${SHA_A}"}`),
      `{"at":"1AbCdEfGhIjKlMnOp",${take(`{"sha256":"${SHA_A}"}`).slice(1)}`,
    ]) {
      const answer = await put(d, "brief", NAME, { body })
      expect([body, answer.status]).toEqual([body, 422])
      expect(await json(answer)).toEqual({ error: "each key is given once" })
    }
    // The same list, spaced and with each key once, is taken.
    const spaced = take(`{ "sha256" : "${SHA_A}" }`).replaceAll(",", ", ")
    expect((await put(d, "brief", NAME, { body: spaced })).status).toBe(201)
  })
})

describe("the routine's study files", () => {
  const SCENE = JSON.stringify({
    schema: "some-ui.routine-scene/1",
    answers: "2026-10-13_morning-drama_session-",
    title: "TOPIK 2 · 로맨스 · 첫 만남",
    decks: [],
  })
  const DRAMA = JSON.stringify({
    schema: "some-ui.routine-drama/1",
    answers: "drama-20261013T145200123Z",
    tree: {},
  })
  // As the phone names a reflection: every session id starts `session-`.
  const RUN = JSON.stringify({
    schema: "some-ui.routine-run/1",
    routine: "reflections",
    startedAt: "2026-10-13T16:02:08Z",
  })
  const SCENE_NAME = "scene-2026-10-13_morning-drama_session-.json"
  const DRAMA_NAME = "drama-20261013T145200123Z.json"
  const RUN_NAME = "run-reflections-20261013T160208Z.json"

  it("the routine puts a scene, a drama and a run, and home reads them and may not put them", async () => {
    const d = deps()
    expect((await put(d, "scene", SCENE_NAME, { body: SCENE })).status).toBe(
      201
    )
    expect((await put(d, "drama", DRAMA_NAME, { body: DRAMA })).status).toBe(
      201
    )
    expect((await put(d, "run", RUN_NAME, { body: RUN })).status).toBe(201)
    for (const [folder, name] of [
      ["scene", SCENE_NAME],
      ["drama", DRAMA_NAME],
      ["run", RUN_NAME],
    ] as const) {
      expect(
        (await send(d, "GET", `/v1/${folder}/items`, { token: HOME })).status
      ).toBe(200)
      expect(
        (await send(d, "GET", `/v1/${folder}/items/${name}`, { token: HOME }))
          .status
      ).toBe(200)
    }
    expect(
      (
        await put(d, "scene", "scene-2026-10-14_x_s-1.json", {
          token: HOME,
          body: SCENE,
        })
      ).status
    ).toBe(403)
    expect(
      (
        await put(d, "run", "run-reflections-20261014T160208Z.json", {
          token: HOME,
          body: RUN,
        })
      ).status
    ).toBe(403)
  })

  it("the routine reads them, lists what is archived and asks for one back; only the archive role archives them", async () => {
    const d = deps()
    await put(d, "scene", SCENE_NAME, { body: SCENE })
    await put(d, "drama", DRAMA_NAME, { body: DRAMA })
    await put(d, "run", RUN_NAME, { body: RUN })
    for (const [folder, name] of [
      ["scene", SCENE_NAME],
      ["drama", DRAMA_NAME],
      ["run", RUN_NAME],
    ] as const) {
      expect((await send(d, "GET", `/v1/${folder}/items/${name}`)).status).toBe(
        200
      )
      expect((await send(d, "GET", `/v1/${folder}/archived`)).status).toBe(200)
      expect(
        (await send(d, "PUT", `/v1/${folder}/wanted/${name}`)).status
      ).toBe(200)
      for (const token of [ROUTINE, HOME]) {
        expect(
          (
            await send(d, "DELETE", `/v1/${folder}/items/${name}`, {
              token,
              headers: { "if-match": `"${"0".repeat(64)}"` },
            })
          ).status
        ).toBe(403)
      }
      expect(
        (
          await send(d, "DELETE", `/v1/${folder}/items/${name}`, {
            token: ARCHIVE,
            headers: { "if-match": `"${"0".repeat(64)}"` },
          })
        ).status
      ).toBe(412)
    }
  })

  it("home puts which lessons were opened, and the routine reads it; neither the other way", async () => {
    const d = deps()
    const OPENED = JSON.stringify({
      schema: "some-ui.routine-opened/1",
      opened: ["scene/scene-a.json"],
    })
    const name = "opened-20261024T160208123Z.json"
    expect(
      (await put(d, "opened", name, { token: HOME, body: OPENED })).status
    ).toBe(201)
    expect((await send(d, "GET", `/v1/opened/items/${name}`)).status).toBe(200)
    expect((await send(d, "GET", "/v1/opened/items")).status).toBe(200)
    expect(
      (
        await put(d, "opened", "opened-20261024T160208124Z.json", {
          body: OPENED,
        })
      ).status
    ).toBe(403)
    expect(
      (await send(d, "GET", `/v1/opened/items/${name}`, { token: HOME })).status
    ).toBe(403)
    for (const wrong of [
      "opened-20261024T160208Z.json",
      "opened-2026-10-24.json",
      "opened-20261024T160208123Z.txt",
    ]) {
      expect([
        wrong,
        (await put(d, "opened", wrong, { token: HOME, body: OPENED })).status,
      ]).toEqual([wrong, 422])
    }
    expect(
      (
        await put(d, "opened", "opened-20261024T160208125Z.json", {
          token: HOME,
          body: RUN,
        })
      ).status
    ).toBe(422)
  })

  it("a second reflection under one name takes a number", async () => {
    const d = deps()
    const second = "scene-2026-10-13_morning-drama_session--2.json"
    expect((await put(d, "scene", second, { body: SCENE })).status).toBe(201)
  })

  it("a name or schema that is not the folder's is refused", async () => {
    const d = deps()
    for (const name of [
      "scene-2026-10-13.json",
      "scene-2026-10-13_Morning_s-1.json",
      "scene-2026-10-13_x_s-1.m4a",
      "2026-10-13_morning-drama_s-7f3a91.json",
    ]) {
      expect([
        name,
        (await put(d, "scene", name, { body: SCENE })).status,
      ]).toEqual([name, 422])
    }
    for (const name of [
      "drama-20261013T145200Z.json",
      "drama-20261013T145200123Z.voice-1.m4a",
      "drama-20261013T145200123Z.prompt.md",
    ]) {
      expect([
        name,
        (await put(d, "drama", name, { body: DRAMA })).status,
      ]).toEqual([name, 422])
    }
    for (const name of [
      "run-20261013T160208Z.json",
      "run-Reflections-20261013T160208Z.json",
      "run-reflections-20261013T160208.json",
      "run-reflections-2026-10-13.json",
    ]) {
      expect([name, (await put(d, "run", name, { body: RUN })).status]).toEqual(
        [name, 422]
      )
    }
    expect((await put(d, "run", RUN_NAME, { body: SCENE })).status).toBe(422)
    expect((await put(d, "scene", SCENE_NAME, { body: DRAMA })).status).toBe(
      422
    )
    expect((await put(d, "drama", DRAMA_NAME, { body: SCENE })).status).toBe(
      422
    )
  })
})

describe("LeetType's files", () => {
  const SESSION = JSON.stringify({
    schema: "some-ui.leetype-session/1",
    file: { title: "One node", screens: [] },
  })
  const LOG = JSON.stringify({
    schema: "some-ui.leetype-log/1",
    session: "0b6c4fae-eae3-47be-bc1f-6c351f98ca3c",
    file: "t1-01-one-node.json",
    events: [],
  })
  const SESSION_NAME = "t1-01-one-node.json"
  const LOG_NAME = "log-0b6c4fae-eae3-47be-bc1f-6c351f98ca3c.json"

  it("the routine puts a session file, and home reads it and may not put one", async () => {
    const d = deps()
    // Thread 1's names in Drive, and a fix's.
    for (const name of [
      SESSION_NAME,
      "t1-02-lost-machine-split-network.json",
      "t1-03-two-flushes-and-the-rate.json",
      "t1-04-old-leaders-old-writes.json",
      "t1-05-fresh-reads.json",
      "t1-01-one-node-r2.json",
    ]) {
      expect([
        name,
        (await put(d, "leetype", name, { body: SESSION })).status,
      ]).toEqual([name, 201])
    }
    const path = `/v1/leetype/items/${SESSION_NAME}`
    expect((await send(d, "GET", path, { token: HOME })).status).toBe(200)
    expect(
      (await send(d, "GET", "/v1/leetype/items", { token: HOME })).status
    ).toBe(200)
    expect(
      (
        await put(d, "leetype", "t1-06-another.json", {
          token: HOME,
          body: SESSION,
        })
      ).status
    ).toBe(403)
  })

  it("home puts a session's log, and the routine reads it; neither the other way", async () => {
    const d = deps()
    expect(
      (await put(d, "leetype-log", LOG_NAME, { token: HOME, body: LOG })).status
    ).toBe(201)
    const path = `/v1/leetype-log/items/${LOG_NAME}`
    expect((await send(d, "GET", path)).status).toBe(200)
    expect((await send(d, "GET", "/v1/leetype-log/items")).status).toBe(200)
    expect((await send(d, "GET", path, { token: HOME })).status).toBe(403)
    expect(
      (await put(d, "leetype-log", "log-another.json", { body: LOG })).status
    ).toBe(403)
  })

  it("takes only its own names and schemas", async () => {
    const d = deps()
    for (const name of [
      "t1-one-node.json",
      "t1-01.json",
      "t1-01-One-Node.json",
      "t1-01-one_node.json",
      "t1-01-one-node.JSON",
      "one-node.json",
    ]) {
      expect([
        name,
        (await put(d, "leetype", name, { body: SESSION })).status,
      ]).toEqual([name, 422])
    }
    for (const name of [
      "log-.json",
      "log-a:b.json",
      `log-${"a".repeat(65)}.json`,
      "log-a.r.json",
      "leetype-log-a.json",
    ]) {
      expect([
        name,
        (await put(d, "leetype-log", name, { token: HOME, body: LOG })).status,
      ]).toEqual([name, 422])
    }
    expect(
      (await put(d, "leetype-log", "log-a.r2.json", { token: HOME, body: LOG }))
        .status
    ).toBe(201)
    expect((await put(d, "leetype", SESSION_NAME, { body: LOG })).status).toBe(
      422
    )
    expect(
      (await put(d, "leetype-log", LOG_NAME, { token: HOME, body: SESSION }))
        .status
    ).toBe(422)
  })
})

describe("voice transcripts", () => {
  const HEARD = {
    schema: "some-ui.voice-transcript/1",
    note: "k3v9qa",
    of: "reflection",
    ref: "session-7f2a",
    at: "2026-10-25T03:10:00.000Z",
    text: "오늘은 the second scene felt slow.",
    language: "ko",
    model: "ggml-small-q5_1.bin",
    heardAt: "2026-10-25T03:12:41.204Z",
  }
  const TRANSCRIPT = JSON.stringify(HEARD)
  const NAME = "transcript-k3v9qa-1.json"
  const asHome = (
    d: Deps,
    name: string,
    body: string = TRANSCRIPT
  ): Promise<Response> => put(d, "transcript", name, { token: HOME, body })

  it("home puts a transcript once, and the routine reads it; neither the other way", async () => {
    const d = deps()
    expect((await asHome(d, NAME)).status).toBe(201)
    expect((await asHome(d, NAME)).status).toBe(200)
    expect(
      (await asHome(d, NAME, JSON.stringify({ ...HEARD, text: "other" })))
        .status
    ).toBe(409)
    // A better model's transcript of the same note goes under a new name.
    expect(
      (
        await asHome(
          d,
          "transcript-k3v9qa-2.json",
          JSON.stringify({ ...HEARD, model: "ggml-medium-q5_0.bin" })
        )
      ).status
    ).toBe(201)

    const path = `/v1/transcript/items/${NAME}`
    const read = await send(d, "GET", path)
    expect(read.status).toBe(200)
    expect(await read.text()).toBe(TRANSCRIPT)
    expect((await send(d, "GET", "/v1/transcript/items")).status).toBe(200)
    expect((await send(d, "GET", path, { token: HOME })).status).toBe(403)
    expect(
      (await send(d, "GET", "/v1/transcript/items", { token: HOME })).status
    ).toBe(403)
    expect(
      (await put(d, "transcript", "transcript-a-1.json", { body: TRANSCRIPT }))
        .status
    ).toBe(403)
  })

  it("refuses a transcript that carries audio or names a Drive file, and says why", async () => {
    const d = deps()
    const audio = "a transcript carries no audio: home keeps the audio"
    const drive = "a transcript names no Drive file: home keeps the audio"
    const wrapped = Array.from({ length: 6 }, () => "GkXfo59C".repeat(10)).join(
      "\n"
    )
    const refused: ReadonlyArray<readonly [string, string]> = [
      [JSON.stringify({ ...HEARD, audio: "T2dnUwACAAAAAAAA" }), audio],
      [JSON.stringify({ ...HEARD, base64: "T2dnUwACAAAAAAAA" }), audio],
      [
        JSON.stringify({
          ...HEARD,
          text: "here data:audio/webm;base64,GkXfo59ChoEB",
        }),
        audio,
      ],
      // Base64 as `base64` prints it, wrapped at 76 columns.
      [JSON.stringify({ ...HEARD, text: wrapped }), audio],
      // `JSON.parse` keeps the second `text`; the stored bytes hold both.
      [
        TRANSCRIPT.replace(
          '"text":',
          '"text":"data:audio/ogg;base64,T2dnUwAC","text":'
        ),
        audio,
      ],
      [
        JSON.stringify({ ...HEARD, driveId: "1AbCdEfGhIjKlMnOpQrStUvWxYz012" }),
        drive,
      ],
      [
        JSON.stringify({ ...HEARD, fileId: "1AbCdEfGhIjKlMnOpQrStUvWxYz012" }),
        drive,
      ],
      [
        JSON.stringify({
          ...HEARD,
          text: "see https://drive.google.com/file/d/1AbC/view",
        }),
        drive,
      ],
    ]
    for (const [index, [body, why]] of refused.entries()) {
      const response = await asHome(d, NAME, body)
      expect([index, response.status, await response.json()]).toEqual([
        index,
        422,
        { error: why },
      ])
    }
  })

  it("takes speech that only talks about audio, data or Drive", async () => {
    const d = deps()
    for (const [index, text] of [
      "Data: we need more of it",
      "the audio on my drive was quiet",
      "I put it on docs.google.com yesterday",
    ].entries()) {
      expect([
        text,
        (
          await asHome(
            d,
            `transcript-k3v9qa-${String(index + 1)}.json`,
            JSON.stringify({ ...HEARD, text })
          )
        ).status,
      ]).toEqual([text, 201])
    }
  })

  it("takes each word heard, with its time and how sure home was of it", async () => {
    const worded = {
      ...HEARD,
      words: [
        { text: "오늘은", startMs: 0, endMs: 400, p: 0.42 },
        { text: "the", startMs: 500, endMs: 600, language: "en" },
        // Whisper's word runs to the next space, so one can be long.
        { text: "아".repeat(300), startMs: 700, endMs: 9000 },
      ],
    }
    expect((await asHome(deps(), NAME, JSON.stringify(worded))).status).toBe(
      201
    )
  })

  it("takes a Studio take's transcript, named by its project, shot and take", async () => {
    const take = { ...HEARD, of: "studio", ref: "short-7:s3:2" }
    expect((await asHome(deps(), NAME, JSON.stringify(take))).status).toBe(201)
  })

  it("takes a Rust Rounds note's transcript, named by its card and what it refines (RR6)", async () => {
    for (const ref of ["indexing-01:a", "indexing-01:refine-a:n0"]) {
      const said = { ...HEARD, of: "rust-round", ref }
      expect((await asHome(deps(), NAME, JSON.stringify(said))).status).toBe(
        201
      )
    }
  })

  it("takes an interview take's transcript, named by its week and question or read card (IW1)", async () => {
    for (const ref of ["2026-w47:about-you", "2026-w47:read:home-first"]) {
      const said = { ...HEARD, of: "interview", ref }
      expect((await asHome(deps(), NAME, JSON.stringify(said))).status).toBe(
        201
      )
    }
  })

  it("takes only a transcript's own shape", async () => {
    const d = deps()
    const { text: _text, ...untold } = HEARD
    const wrong: ReadonlyArray<readonly [Record<string, unknown>, string]> = [
      [
        { ...HEARD, words: 7 },
        "words must be each word heard, with its time and how sure",
      ],
      [
        {
          ...HEARD,
          words: [{ text: "오늘은", startMs: 0, endMs: 400, p: 1.2 }],
        },
        "words must be each word heard, with its time and how sure",
      ],
      [
        { ...HEARD, words: [{ text: "오늘은", startMs: 500, endMs: 400 }] },
        "words must be each word heard, with its time and how sure",
      ],
      [
        { ...HEARD, words: [{ text: "", startMs: 0, endMs: 400 }] },
        "words must be each word heard, with its time and how sure",
      ],
      [
        { ...HEARD, words: [{ text: "x", startMs: 0, endMs: 1, lang: "ko" }] },
        "words must be each word heard, with its time and how sure",
      ],
      [
        {
          ...HEARD,
          words: [{ text: "x", startMs: 0, endMs: 1, language: "Korean" }],
        },
        "words must be each word heard, with its time and how sure",
      ],
      [{ ...HEARD, note: "" }, "note must be the note's id"],
      [{ ...HEARD, note: "a/b" }, "note must be the note's id"],
      [{ ...HEARD, note: "zzz" }, "the name must carry the note's id"],
      // `transcript-k3v9qa-1.json` is note `k3v9qa`'s, not note `k3v9qa-1`'s
      // first, nor `k3v`'s.
      [{ ...HEARD, note: "k3v" }, "the name must carry the note's id"],
      [
        { ...HEARD, of: "diary" },
        "of must be reflection, jobs, scene, studio, rust-round or interview",
      ],
      [{ ...HEARD, ref: 7 }, "ref must name what the note belongs to"],
      [{ ...HEARD, at: "soon" }, "at must be when the note was recorded"],
      [
        { ...HEARD, at: "2026-10-25T03:10:00" },
        "at must be when the note was recorded",
      ],
      [untold, "text must be what home heard"],
      [{ ...HEARD, text: "  " }, "text must be what home heard"],
      [
        { ...HEARD, language: "Korean" },
        "language must be the language heard, as en or ko",
      ],
      [{ ...HEARD, model: "" }, "model must name the model that heard it"],
      [{ ...HEARD, heardAt: 1 }, "heardAt must be when home heard it"],
    ]
    for (const [index, [body, why]] of wrong.entries()) {
      const response = await asHome(d, NAME, JSON.stringify(body))
      expect([index, response.status, await response.json()]).toEqual([
        index,
        422,
        { error: why },
      ])
    }
    const hyphened = JSON.stringify({ ...HEARD, note: "a-2" })
    expect(
      (
        await asHome(
          d,
          "transcript-a-2-1.json",
          JSON.stringify({ ...HEARD, note: "a" })
        )
      ).status
    ).toBe(422)
    expect((await asHome(d, "transcript-a-2-1.json", hyphened)).status).toBe(
      201
    )
    for (const name of [
      "transcript-k3v9qa.json",
      "transcript--1.json",
      "transcript-k3v9qa-x.json",
      "transcript-k3v9qa-0.json",
      "transcript-k3v9qa-01.json",
      `transcript-${"a".repeat(65)}-1.json`,
      "transcript-k3v9qa-1.webm",
      "k3v9qa_voice-20261025T031000Z-k3v9qa.m4a",
    ]) {
      expect([name, (await asHome(d, name)).status]).toEqual([name, 422])
    }
  })
})

describe("home's indexes", () => {
  const JOBS = {
    schema: "some-ui.routine-index/1",
    routine: "jobs",
    day: "2026-10-31",
    validThrough: "2026-11-01",
    asOf: "2026-10-31T14:45:02.118Z",
    from: {
      digests: ["digest-2026-10-30.json"],
      decisions: ["decisions-2026-10-30.json"],
      scout: [],
      backfill: [],
    },
    skipped: [],
    queue: {
      open: [
        {
          day: "2026-10-30",
          pickId: "tid-7f2a",
          track: "software",
          fingerprint: "tidewater|backend engineer|remote",
          title: "Backend Engineer",
          company: "Tidewater",
          applyUrl: "https://jobs.lever.co/tidewater/6f1c2b9e",
        },
      ],
      lapsed: [],
      free: { software: 2, adjacent: 2 },
    },
    new: {
      decisions: [{ name: "decisions-2026-10-30.json", repeats: [] }],
      scout: [],
    },
    notes: [
      {
        file: "decisions-2026-10-30_voice-1.webm",
        in: "decisions-2026-10-30.json",
        note: "k3v9qa",
        transcript: {
          name: "transcript-k3v9qa-1.json",
          sha256: "a".repeat(64),
        },
      },
    ],
    picked: ["tidewater|backend engineer|remote"],
  }
  const INDEX = JSON.stringify(JOBS)
  const NAME = "index-jobs-20261031T144502118Z.json"
  const asHome = (
    d: Deps,
    name: string,
    body: string = INDEX
  ): Promise<Response> => put(d, "index", name, { token: HOME, body })

  it("home puts an index and the routine reads it, neither the other way, and an older one is a 409", async () => {
    const d = deps()
    const NEWER = "index-jobs-20261101T080001003Z.json"
    const NEWER_BODY = { ...JOBS, day: "2026-11-01" }
    expect((await asHome(d, NAME)).status).toBe(201)
    expect((await asHome(d, NEWER, JSON.stringify(NEWER_BODY))).status).toBe(
      201
    )
    const newer = `/v1/index/items/${NEWER}`
    const read = await send(d, "GET", newer)
    expect(read.status).toBe(200)
    expect(await json(read)).toEqual(NEWER_BODY)
    // The store answers `superseded` (store.test.ts); here, what home hears.
    const older = await asHome(d, "index-jobs-20261031T150000000Z.json")
    expect(older.status).toBe(409)
    expect(await json(older)).toEqual({
      error: "a newer index of this routine is held",
    })
    expect((await send(d, "GET", newer, { token: HOME })).status).toBe(403)
    expect(
      (await send(d, "GET", "/v1/index/items", { token: HOME })).status
    ).toBe(403)
    expect((await put(d, "index", NAME, { body: INDEX })).status).toBe(403)
  })

  it("takes only its own names", async () => {
    const d = deps()
    for (const name of [
      "index-jobs-20261031T144502Z.json",
      "index-Jobs-20261031T144502118Z.json",
      "index-20261031T144502118Z.json",
      "jobs-index-20261031T144502118Z.json",
      "index-jobs-20261031T144502118Z.webm",
    ]) {
      expect([name, (await asHome(d, name)).status]).toEqual([name, 422])
    }
  })

  it("takes only a jobs index's own shape, and says why not", async () => {
    const d = deps()
    const refused = async (
      body: Record<string, unknown>,
      name = NAME
    ): Promise<unknown> => {
      const response = await asHome(d, name, JSON.stringify(body))
      expect(response.status).toBe(422)
      return json(response)
    }
    expect(await refused({ ...JOBS, routine: "topik" })).toEqual({
      error: "routine must be jobs or reflections or call or rust or interview",
    })
    expect(await refused(JOBS, "index-topik-20261031T144502118Z.json")).toEqual(
      { error: "the name must carry the body's routine" }
    )
    expect(await refused({ ...JOBS, drafts: [] })).toEqual({
      error: "drafts is not part of a jobs index",
    })
    const { picked: _, ...short } = JOBS
    expect(await refused(short)).toEqual({
      error: "the jobs index carries picked",
    })
    for (const day of [
      "2026-10-31T00:00:00Z",
      "31-10-2026",
      "2026-13-01",
      "2026-02-30",
      7,
    ]) {
      expect(await refused({ ...JOBS, day })).toEqual({
        error: "day must be the day the index is for",
      })
    }
    for (const validThrough of [
      "2026-10-30",
      "tomorrow",
      3,
      "2026-02-30x",
      "2026-11-31",
    ]) {
      expect(await refused({ ...JOBS, validThrough })).toEqual({
        error: "validThrough must be a day from day on, or null",
      })
    }
    const { validThrough: _v, ...unbounded } = JOBS
    expect(await refused(unbounded)).toEqual({
      error: "the jobs index carries validThrough",
    })
    expect(await refused({ ...JOBS, asOf: "this morning" })).toEqual({
      error: "asOf must be when home last took in what the index counts",
    })
    expect(await refused({ ...JOBS, queue: [] })).toEqual({
      error: "queue must be an object",
    })
    expect(await refused({ ...JOBS, notes: {} })).toEqual({
      error: "notes must be a list",
    })
    // Home's first index, before it holds anything: no asOf, and with no
    // open pick nothing can lapse.
    expect(
      (
        await asHome(
          d,
          NAME,
          JSON.stringify({ ...JOBS, asOf: null, validThrough: null })
        )
      ).status
    ).toBe(201)
  })

  it("is never archived, listed as archived or asked for", async () => {
    const d = deps()
    expect((await asHome(d, NAME)).status).toBe(201)
    const path = `/v1/index/items/${NAME}`
    const sha = createHash("sha256").update(INDEX).digest("hex")
    for (const token of [ROUTINE, HOME, ARCHIVE]) {
      expect(
        (
          await send(d, "DELETE", path, {
            token,
            headers: { "if-match": `"${sha}"` },
          })
        ).status
      ).toBe(403)
      for (const collection of ["archived", "wanted"]) {
        expect(
          (await send(d, "GET", `/v1/index/${collection}`, { token })).status
        ).toBe(403)
      }
      expect(
        (await send(d, "PUT", `/v1/index/wanted/${NAME}`, { token })).status
      ).toBe(403)
    }
  })

  it("refuses an index that carries audio or names a Drive file", async () => {
    const d = deps()
    const audio = { error: "an index carries no audio: home keeps the audio" }
    const drive = { error: "an index names no Drive file" }
    const withNote = (file: string): string =>
      JSON.stringify({ ...JOBS, notes: [{ ...JOBS.notes[0], file }] })
    for (const [body, why] of [
      [withNote("data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC"), audio],
      [withNote("A".repeat(300)), audio],
      [withNote("https://drive.google.com/file/d/1AbC/view"), drive],
      [JSON.stringify({ ...JOBS, audio: "take-1" }), audio],
      [JSON.stringify({ ...JOBS, driveId: "1AbC" }), drive],
    ] as const) {
      const response = await asHome(d, NAME, body)
      expect(response.status).toBe(422)
      expect(await json(response)).toEqual(why)
    }
  })
})

describe("home's reflections index", () => {
  const REFLECTIONS = {
    schema: "some-ui.routine-index/1",
    routine: "reflections",
    asOf: "2026-10-31T14:45:02.118Z",
    validUntil: "2026-11-02T14:01:00.000Z",
    skipped: [],
    answered: {
      scenes: ["2026-10-29_reflection_2a4b6c01", "2026-10-30_stock_1"],
      dramas: ["drama-20261029T071503120Z"],
    },
    words: [{ id: "coffee", lemma: "커피" }],
    recent: [
      {
        name: "scene-2026-10-30_stock_1.json",
        answers: "2026-10-30_stock_1",
        title: "TOPIK 2 · thriller · The last train",
        level: 2,
        genre: "thriller",
      },
    ],
    unopened: {
      count: 1,
      lessons: ["scene/scene-2026-10-30_stock_1.json"],
      opened: "opened-20261031T000000000Z.json",
    },
    reflections: [
      {
        base: "2026-10-31_reflection_2a4b6c01",
        session: "session-7f3a91c2-5d1e-4b6a-9c3f-0e8d2a4b6c01",
        day: "2026-10-31",
        reflections: ["reflection-r1.json"],
        newestAt: "2026-10-31T14:00:00.000Z",
        settled: true,
        notes: [{ note: "k3v9qa", transcript: null }],
        voice: {
          state: "waiting",
          since: "2026-10-31T14:01:00.000Z",
          until: "2026-11-02T14:01:00.000Z",
        },
      },
    ],
    prompts: [],
  }
  const NAME = "index-reflections-20261031T144502118Z.json"
  const asHome = (
    d: Deps,
    name: string,
    body: unknown = REFLECTIONS
  ): Promise<Response> =>
    put(d, "index", name, { token: HOME, body: JSON.stringify(body) })

  it("keeps a validUntil of null as home put it", async () => {
    const d = deps()
    const body = { ...REFLECTIONS, validUntil: null }
    expect((await asHome(d, NAME, body)).status).toBe(201)
    expect(await json(await send(d, "GET", `/v1/index/items/${NAME}`))).toEqual(
      body
    )
  })

  it("takes only a reflections index's own shape, and says why not", async () => {
    const d = deps()
    const refused = async (body: Record<string, unknown>): Promise<unknown> => {
      const response = await asHome(d, NAME, body)
      expect(response.status).toBe(422)
      return json(response)
    }
    expect(await refused({ ...REFLECTIONS, day: "2026-10-31" })).toEqual({
      error: "day is not part of a reflections index",
    })
    const { words: _, ...short } = REFLECTIONS
    expect(await refused(short)).toEqual({
      error: "the reflections index carries words",
    })
    for (const validUntil of [
      "2026-10-31T14:45:02.118Z",
      "2026-10-30T00:00:00.000Z",
      "in two days",
      "2026-11-02",
    ]) {
      expect(await refused({ ...REFLECTIONS, validUntil })).toEqual({
        error: "validUntil must be a moment after asOf, or null",
      })
    }
    expect(await refused({ ...REFLECTIONS, asOf: null })).toEqual({
      error: "validUntil must be a moment after asOf, or null",
    })
    expect(await refused({ ...REFLECTIONS, asOf: "this morning" })).toEqual({
      error: "asOf must be when home last took in what the index counts",
    })
    expect(await refused({ ...REFLECTIONS, answered: [] })).toEqual({
      error: "answered must be an object",
    })
    expect(await refused({ ...REFLECTIONS, prompts: {} })).toEqual({
      error: "prompts must be a list",
    })
    expect(
      (await asHome(d, NAME, { ...REFLECTIONS, asOf: null, validUntil: null }))
        .status
    ).toBe(201)
  })
})

describe("home's call index", () => {
  const HASH = "a".repeat(64)
  const CALL = {
    schema: "some-ui.routine-index/1",
    routine: "call",
    asOf: "2026-11-06T09:00:00.000Z",
    held: [
      { from: "2026-11-06", to: "2026-11-12", sha256: "b".repeat(64) },
      { from: "2026-10-30", to: "2026-11-05", sha256: HASH },
    ],
  }
  const NAME = "index-call-20261106T090000000Z.json"
  const asHome = (d: Deps, body: unknown = CALL): Promise<Response> =>
    put(d, "index", NAME, { token: HOME, body: JSON.stringify(body) })

  it("home puts it and the routine reads it, as home put it", async () => {
    const d = deps()
    expect((await asHome(d)).status).toBe(201)
    expect(await json(await send(d, "GET", `/v1/index/items/${NAME}`))).toEqual(
      CALL
    )
  })

  it("takes only a call index's own shape, and says why not", async () => {
    const d = deps()
    const refused = async (body: Record<string, unknown>): Promise<unknown> => {
      const response = await asHome(d, body)
      expect(response.status).toBe(422)
      return json(response)
    }
    const week = { from: "2026-10-30", to: "2026-11-05", sha256: HASH }
    for (const asOf of [null, "this morning", "2026-11-06"]) {
      expect(await refused({ ...CALL, asOf })).toEqual({
        error: "asOf must be when home last took a week",
      })
    }
    expect(await refused({ ...CALL, held: {} })).toEqual({
      error: "held must be a list",
    })
    for (const held of [
      ["2026-10-30"],
      [{ from: "2026-10-30", to: "2026-11-05" }],
      [{ ...week, words: "Hello." }],
    ]) {
      expect(await refused({ ...CALL, held })).toEqual({
        error: "each held week is its from, to and sha256",
      })
    }
    for (const days of [
      { from: "2026-11-05", to: "2026-10-30" },
      { from: "2026-02-30", to: "2026-03-05" },
      { from: "../2026-10-30", to: "2026-11-05" },
    ]) {
      expect(await refused({ ...CALL, held: [{ ...week, ...days }] })).toEqual({
        error: "each held week runs from a day to a day no earlier",
      })
    }
    for (const sha256 of ["A".repeat(64), "a".repeat(63), 7]) {
      expect(await refused({ ...CALL, held: [{ ...week, sha256 }] })).toEqual({
        error: "each held week's sha256 is 64 lower-case hex characters",
      })
    }
    expect(await refused({ ...CALL, held: [week, week] })).toEqual({
      error: "each held week is named once",
    })
    expect((await asHome(d, { ...CALL, held: [] })).status).toBe(201)
  })
})

describe("home's Rust Rounds index", () => {
  // A final week as home's record gives it (RR18, paulgsc/some-ui#2693).
  const W46 = {
    week: "2026-w46",
    opens: "2026-11-09T00:00:00-08:00",
    due: "2026-11-15T23:59:00-08:00",
    closed: true,
    sent: {
      at: "2026-11-14T20:31:07.000Z",
      receivedAt: "2026-11-14T20:31:09.120Z",
      draft: false,
    },
    tickets: [
      {
        ticket: "QM-311",
        answered: true,
        take: "note-311",
        recordedAt: "2026-11-14T20:12:40.000Z",
        opens: 3,
      },
    ],
    unanswered: [],
    pastes: [
      {
        at: "2026-11-12T17:04:00.000Z",
        text: "error[E0277]: `Rc<Vec<u8>>` cannot be sent between threads safely",
        note: "note-p1",
        receivedAt: "2026-11-12T17:04:02.000Z",
      },
    ],
  }
  const RUST = {
    schema: "some-ui.routine-index/1",
    routine: "rust",
    asOf: "2026-11-14T20:31:09.120Z",
    weeks: [W46],
  }
  const NAME = "index-rust-20261116T090000000Z.json"
  const asHome = (d: Deps, body: unknown = RUST): Promise<Response> =>
    put(d, "index", NAME, { token: HOME, body: JSON.stringify(body) })
  const refused = async (d: Deps, body: unknown): Promise<unknown> => {
    const response = await asHome(d, body)
    expect(response.status).toBe(422)
    return json(response)
  }
  const withPaste = (text: string): Record<string, unknown> => ({
    ...RUST,
    weeks: [{ ...W46, pastes: [{ ...W46.pastes[0], text }] }],
  })

  it("home puts it and the routine reads it, as home put it", async () => {
    const d = deps()
    expect((await asHome(d)).status).toBe(201)
    expect(await json(await send(d, "GET", `/v1/index/items/${NAME}`))).toEqual(
      RUST
    )
    expect(
      (await asHome(deps(), { ...RUST, asOf: null, weeks: [] })).status
    ).toBe(201)
  })

  it("takes only final weeks, each once, and says why not", async () => {
    const d = deps()
    expect(await refused(d, { ...RUST, extra: 1 })).toEqual({
      error: "extra is not part of a rust index",
    })
    expect(await refused(d, { ...RUST, asOf: "Monday" })).toEqual({
      error: "asOf must be when home last took in what the index counts",
    })
    expect(await refused(d, { ...RUST, weeks: {} })).toEqual({
      error: "weeks must be a list",
    })
    expect(await refused(d, { ...RUST, weeks: ["2026-w46"] })).toEqual({
      error: "each week must be an object",
    })
    expect(
      await refused(d, { ...RUST, weeks: [{ ...W46, week: "w46" }] })
    ).toEqual({
      error: "each week's week must be its id, like 2026-w46",
    })
    expect(await refused(d, { ...RUST, weeks: [W46, W46] })).toEqual({
      error: "each week is named once",
    })
    expect(
      await refused(d, { ...RUST, weeks: [{ ...W46, closed: false }] })
    ).toEqual({
      error: "each week must be past its deadline",
    })
    for (const sent of [{ ...W46.sent, draft: true }, "final"]) {
      expect(await refused(d, { ...RUST, weeks: [{ ...W46, sent }] })).toEqual({
        error: "each week's send must be its final, or null",
      })
    }
    expect(
      await refused(d, { ...RUST, weeks: [{ ...W46, pastes: {} }] })
    ).toEqual({ error: "each week's tickets and pastes must be lists" })
    expect(
      (await asHome(d, { ...RUST, weeks: [{ ...W46, sent: null }] })).status
    ).toBe(201)
  })

  it("reads a pasted error as text, and still refuses audio or a Drive link in it", async () => {
    // A v0-mangled symbol: past 256 base64-like characters, and only text.
    const symbol = `_RNvMs${"0123456789abcdefABCDEF_".repeat(14)}`
    expect(
      (await asHome(deps(), withPaste(`undefined symbol: ${symbol}`))).status
    ).toBe(201)
    const d = deps()
    expect(
      await refused(d, withPaste("see data:audio/webm;base64,AAAA"))
    ).toEqual({
      error: "an index carries no audio: home keeps the audio",
    })
    expect(
      await refused(d, withPaste("https://drive.google.com/file/d/x"))
    ).toEqual({
      error: "an index names no Drive file",
    })
    expect(await refused(d, withPaste("e".repeat(20_001)))).toEqual({
      error: "a pasted error is at most 20000 characters",
    })
    // Home's cap is in characters: 20,000 emoji are 40,000 UTF-16 units.
    expect((await asHome(deps(), withPaste("🦀".repeat(20_000)))).status).toBe(
      201
    )
    // The same long run under another key is still scanned (Codex, #2864).
    const run = "A".repeat(300)
    expect(
      await refused(d, {
        ...withPaste(run),
        weeks: [
          {
            ...W46,
            pastes: [{ ...W46.pastes[0], text: run }],
            unanswered: [run],
          },
        ],
      })
    ).toEqual({ error: "an index carries no audio: home keeps the audio" })
    // Outside a paste's text, a long encoded run is refused as anywhere else.
    expect(
      await refused(d, { ...RUST, weeks: [{ ...W46, unanswered: [symbol] }] })
    ).toEqual({ error: "an index carries no audio: home keeps the audio" })
  })
})

const WRITTEN = {
  schema: "some-ui.reflection/1",
  reflection: "3f9c2a1e-7b4d-4c1a-9e2f-0a1b2c3d4e5f",
  session: "s-7f3a91c2",
  at: "2026-10-25T03:10:00.000Z",
  text: "The second scene felt slow; more level two, please.",
}
const STAMP = "drama-20261031T071503120Z"
const ASKED_FOR = {
  schema: "some-ui.drama-prompt/1",
  prompt: STAMP,
  text: [
    "> **For an agent:** follow the prompt below.",
    "",
    '<!-- notes: {"drama-20261031T071503120Z.voice-1.webm":"3f9c2a1e-7b4d"} -->',
    "Write one scene: the fiancée meets his mother.",
  ].join("\n"),
}

describe("home's interview week index (IW4)", () => {
  // A final week as home's record gives it (paulgsc/server `GET /interview-weeks/:id/record`).
  const W47 = {
    week: "2026-w47",
    opens: "2026-11-16T00:00:00-08:00",
    due: "2026-11-22T23:59:00-08:00",
    closed: true,
    sent: {
      at: "2026-11-21T20:31:07.000Z",
      receivedAt: "2026-11-21T20:31:09.120Z",
      draft: false,
    },
    questions: [
      {
        question: "conflict",
        answered: true,
        take: "note-401",
        recordedAt: "2026-11-21T20:12:40.000Z",
      },
    ],
    cards: [
      { card: "invariant-rs1", read: false, take: null, recordedAt: null },
    ],
    unanswered: [],
    unread: ["invariant-rs1"],
  }
  const INDEX = {
    schema: "some-ui.routine-index/1",
    routine: "interview",
    asOf: "2026-11-22T23:59:00.000-08:00",
    weeks: [W47],
  }
  const NAME = "index-interview-20261123T090000000Z.json"
  const asHome = (body: unknown): Promise<Response> =>
    put(deps(), "index", NAME, { token: HOME, body: JSON.stringify(body) })

  it("home puts it, before any week is final too", async () => {
    expect((await asHome(INDEX)).status).toBe(201)
    expect((await asHome({ ...INDEX, asOf: null, weeks: [] })).status).toBe(201)
    expect(
      (await asHome({ ...INDEX, weeks: [{ ...W47, sent: null }] })).status
    ).toBe(201)
  })

  it("takes only final weeks with their lists, and only its own keys", async () => {
    const error = async (body: unknown): Promise<unknown> =>
      json(await asHome(body))
    expect(await error({ ...INDEX, tickets: [] })).toEqual({
      error: "tickets is not part of an interview index",
    })
    expect(
      await error({ ...INDEX, weeks: [{ ...W47, closed: false }] })
    ).toEqual({ error: "each week must be past its deadline" })
    expect(
      await error({ ...INDEX, weeks: [{ ...W47, sent: { draft: true } }] })
    ).toEqual({ error: "each week's send must be its final, or null" })
    expect(
      await error({ ...INDEX, weeks: [{ ...W47, unread: undefined }] })
    ).toEqual({
      error:
        "each week's questions, cards, unanswered and unread must be lists",
    })
    expect(await error({ ...INDEX, weeks: [W47, W47] })).toEqual({
      error: "each week is named once",
    })
    expect(
      (
        await put(deps(), "index", "index-rust-20261123T090000000Z.json", {
          token: HOME,
          body: JSON.stringify(INDEX),
        })
      ).status
    ).toBe(422)
  })
})

describe("written reflections", () => {
  const REFLECTION = JSON.stringify(WRITTEN)
  const NAME = `reflection-${WRITTEN.reflection}.json`
  const asHome = (
    d: Deps,
    name: string,
    body: string = REFLECTION
  ): Promise<Response> => put(d, "reflection", name, { token: HOME, body })

  it("home puts a reflection once, and the routine reads it; neither the other way", async () => {
    const d = deps()
    expect((await asHome(d, NAME)).status).toBe(201)
    expect((await asHome(d, NAME)).status).toBe(200)
    expect(
      (await asHome(d, NAME, JSON.stringify({ ...WRITTEN, text: "other" })))
        .status
    ).toBe(409)

    const path = `/v1/reflection/items/${NAME}`
    const read = await send(d, "GET", path)
    expect(read.status).toBe(200)
    expect(await read.text()).toBe(REFLECTION)
    expect((await send(d, "GET", "/v1/reflection/items")).status).toBe(200)
    expect((await send(d, "GET", path, { token: HOME })).status).toBe(403)
    expect(
      (await send(d, "GET", "/v1/reflection/items", { token: HOME })).status
    ).toBe(403)
    expect(
      (await put(d, "reflection", NAME, { body: REFLECTION })).status
    ).toBe(403)
  })

  it("the routine neither lists archived reflections nor asks one back", async () => {
    const d = deps()
    expect((await asHome(d, NAME)).status).toBe(201)
    expect((await send(d, "GET", "/v1/reflection/archived")).status).toBe(403)
    expect((await send(d, "PUT", `/v1/reflection/wanted/${NAME}`)).status).toBe(
      403
    )
  })

  it("takes only a written reflection's own shape", async () => {
    const d = deps()
    const { text: _text, ...untexted } = WRITTEN
    const { at: _at, ...undated } = WRITTEN
    const { session: _session, ...unsessioned } = WRITTEN
    const shapes: ReadonlyArray<readonly [unknown, string]> = [
      [{ ...WRITTEN, kind: "text" }, "kind is not part of a reflection"],
      [{ ...WRITTEN, atMs: 1000 }, "atMs is not part of a reflection"],
      [
        { ...WRITTEN, answers: { difficulty: "right" } },
        "answers is not part of a reflection",
      ],
      [untexted, "text must be what was written"],
      [{ ...WRITTEN, text: "  " }, "text must be what was written"],
      [undated, "at must be when it was written"],
      [{ ...WRITTEN, at: "yesterday" }, "at must be when it was written"],
      [unsessioned, "session must name the session it is about"],
      [{ ...WRITTEN, reflection: 7 }, "reflection must be the reflection's id"],
      [
        { ...WRITTEN, reflection: "a/b" },
        "the name must carry the reflection's id",
      ],
      [
        { ...WRITTEN, reflection: "another-id" },
        "the name must carry the reflection's id",
      ],
    ]
    for (const [body, why] of shapes) {
      const answer = await asHome(d, NAME, JSON.stringify(body))
      expect(answer.status).toBe(422)
      expect(await json(answer)).toEqual({ error: why })
    }
    for (const name of [
      "reflection-.json",
      `reflection-${"a".repeat(65)}.json`,
      "reflection-a.b.json",
      `reflection-${WRITTEN.reflection}.webm`,
      `${WRITTEN.reflection}.json`,
    ]) {
      expect((await asHome(d, name)).status).toBe(422)
    }
  })
})

describe("drama prompts", () => {
  const PROMPT = JSON.stringify(ASKED_FOR)
  const NAME = `${STAMP}.prompt.json`
  const asHome = (
    d: Deps,
    name: string,
    body: string = PROMPT
  ): Promise<Response> => put(d, "prompt", name, { token: HOME, body })

  it("home puts a prompt once, and the routine reads it; neither the other way", async () => {
    const d = deps()
    expect((await asHome(d, NAME)).status).toBe(201)

    const path = `/v1/prompt/items/${NAME}`
    const read = await send(d, "GET", path)
    expect(read.status).toBe(200)
    expect(await read.text()).toBe(PROMPT)
    expect((await send(d, "GET", "/v1/prompt/items")).status).toBe(200)
    expect((await send(d, "GET", path, { token: HOME })).status).toBe(403)
    expect(
      (await send(d, "GET", "/v1/prompt/items", { token: HOME })).status
    ).toBe(403)
    expect((await put(d, "prompt", NAME, { body: PROMPT })).status).toBe(403)
  })

  it("the routine neither lists archived prompts nor asks one back", async () => {
    const d = deps()
    expect((await asHome(d, NAME)).status).toBe(201)
    expect((await send(d, "GET", "/v1/prompt/archived")).status).toBe(403)
    expect((await send(d, "PUT", `/v1/prompt/wanted/${NAME}`)).status).toBe(403)
  })

  it("takes only a prompt's own shape", async () => {
    const d = deps()
    const { text: _text, ...untexted } = ASKED_FOR
    const shapes: ReadonlyArray<readonly [unknown, string]> = [
      [{ ...ASKED_FOR, notes: ["a"] }, "notes is not part of a prompt"],
      [
        { ...ASKED_FOR, at: "2026-10-31T07:15:03.120Z" },
        "at is not part of a prompt",
      ],
      [untexted, "text must be the prompt"],
      [{ ...ASKED_FOR, text: "  " }, "text must be the prompt"],
      [
        { ...ASKED_FOR, prompt: "drama-2026-10-31" },
        "the name must carry the prompt's stamp",
      ],
      [
        { ...ASKED_FOR, prompt: "drama-20261031T071503121Z" },
        "the name must carry the prompt's stamp",
      ],
      [{ ...ASKED_FOR, prompt: 7 }, "prompt must be the prompt's stamp"],
    ]
    for (const [body, why] of shapes) {
      const answer = await asHome(d, NAME, JSON.stringify(body))
      expect(answer.status).toBe(422)
      expect(await json(answer)).toEqual({ error: why })
    }
    for (const name of [
      `${STAMP}.json`,
      `${STAMP}.prompt.md`,
      "drama-20261031T0715031Z.prompt.json",
      `prompt-${STAMP}.json`,
    ]) {
      expect((await asHome(d, name)).status).toBe(422)
    }
  })
})

const NOTED = {
  schema: "some-ui.episode-note/1",
  note: "3f9c2a1e-7b4d-4c1a-9e2f-0a1b2c3d4e5f",
  feed: "call",
  episode: "2026-11-13",
  atMs: 134_000,
  categories: ["shallow", "overlap"],
  take: null,
  writtenAt: "2026-11-14T03:00:00.000Z",
}

describe("notes on an episode", () => {
  const NOTE = JSON.stringify(NOTED)
  const NAME = `feedback-${NOTED.note}.json`
  const asHome = (
    d: Deps,
    name: string,
    body: string = NOTE
  ): Promise<Response> => put(d, "feedback", name, { token: HOME, body })

  it("home puts a note once, and the routine reads it; neither the other way", async () => {
    const d = deps()
    expect((await asHome(d, NAME)).status).toBe(201)
    expect((await asHome(d, NAME)).status).toBe(200)
    expect(
      (await asHome(d, NAME, JSON.stringify({ ...NOTED, atMs: 1 }))).status
    ).toBe(409)

    const path = `/v1/feedback/items/${NAME}`
    const read = await send(d, "GET", path)
    expect(read.status).toBe(200)
    expect(await read.text()).toBe(NOTE)
    expect((await send(d, "GET", path, { token: HOME })).status).toBe(403)
    expect((await put(d, "feedback", NAME, { body: NOTE })).status).toBe(403)
  })

  it("the routine neither lists archived notes nor asks one back", async () => {
    const d = deps()
    expect((await asHome(d, NAME)).status).toBe(201)
    expect((await send(d, "GET", "/v1/feedback/archived")).status).toBe(403)
    expect((await send(d, "PUT", `/v1/feedback/wanted/${NAME}`)).status).toBe(
      403
    )
  })

  it("takes a spoken note's take by its id", async () => {
    const d = deps()
    const body = JSON.stringify({ ...NOTED, take: "take-7f3a91c2" })
    expect((await asHome(d, NAME, body)).status).toBe(201)
  })

  it("takes only a note's own shape", async () => {
    const d = deps()
    const shapes: ReadonlyArray<readonly [unknown, string]> = [
      [{ ...NOTED, words: "too slow" }, "words is not part of a note"],
      [
        { ...NOTED, audio: "T2dnUwACAAAAAAAA" },
        "a note carries no audio: a spoken one goes as its take's transcript",
      ],
      [{ ...NOTED, driveId: "1AbCdEf" }, "a note names no Drive file"],
      [{ ...NOTED, note: "another-id" }, "the name must carry the note's id"],
      [{ ...NOTED, note: "a/b" }, "the name must carry the note's id"],
      [{ ...NOTED, feed: "drama" }, "feed must be call or playoff-delta"],
      [{ ...NOTED, episode: "" }, "episode must name the episode"],
      [
        { ...NOTED, atMs: -1 },
        "atMs must be the moment, in whole milliseconds from the start",
      ],
      [
        { ...NOTED, atMs: 1.5 },
        "atMs must be the moment, in whole milliseconds from the start",
      ],
      ...[
        [],
        ["overlap", "shallow"],
        ["voice", "voice"],
        ["louder"],
        [["shallow"], "overlap"],
        [["overlap"]],
      ].map(
        (categories) =>
          [
            { ...NOTED, categories },
            "categories must be the fixed set's, each once, in its order",
          ] as const
      ),
      [
        { ...NOTED, take: 7 },
        "take must be the spoken note's take id, or null",
      ],
      [
        { ...NOTED, writtenAt: "Tuesday" },
        "writtenAt must be when it was written",
      ],
    ]
    for (const [body, why] of shapes) {
      const answer = await asHome(d, NAME, JSON.stringify(body))
      expect(answer.status).toBe(422)
      expect(await json(answer)).toEqual({ error: why })
    }
    // A body that carries its name, so only the name's own rule refuses it.
    for (const note of ["a.b", "a b", "a".repeat(65)]) {
      const answer = await asHome(
        d,
        `feedback-${note}.json`,
        JSON.stringify({ ...NOTED, note })
      )
      expect(answer.status).toBe(422)
      expect(await json(answer)).toEqual({
        error: "the name does not fit this folder",
      })
    }
    for (const name of ["feedback-.json", `feedback-${"a".repeat(65)}.json`]) {
      expect((await asHome(d, name)).status).toBe(422)
    }
  })
})

const READY = {
  schema: "some-ui.take-pickup/1",
  note: "take-7f3a91c2",
  ref: "build-journal:ep04:2",
  heard: "This shot opens on the conveyor page, then cuts to the phone.",
  labels: ["ep04", "opening"],
  readyAt: "2026-11-13T21:40:00.000Z",
  seq: 3,
}
const FILED = {
  schema: "some-ui.take-picked/1",
  note: READY.note,
  seq: READY.seq,
  issue: "paulgsc/some-ui#2990",
}

describe("a take ready for pickup, and the routine's answer (CONVEYOR3)", () => {
  const PICKUP = JSON.stringify(READY)
  const PICKED = JSON.stringify(FILED)
  const PICKUP_NAME = `pickup-${READY.note}-${READY.seq}.json`
  const PICKED_NAME = `picked-${FILED.note}-${FILED.seq}.json`
  const asHome = (
    d: Deps,
    name: string,
    body: string = PICKUP
  ): Promise<Response> => put(d, "pickup", name, { token: HOME, body })
  const asRoutine = (
    d: Deps,
    name: string,
    body: string = PICKED
  ): Promise<Response> => put(d, "picked", name, { body })

  it("home puts a pickup once, and the routine reads it; neither the other way", async () => {
    const d = deps()
    expect((await asHome(d, PICKUP_NAME)).status).toBe(201)
    expect((await asHome(d, PICKUP_NAME)).status).toBe(200)
    expect(
      (
        await asHome(
          d,
          PICKUP_NAME,
          JSON.stringify({ ...READY, labels: ["ep05"] })
        )
      ).status
    ).toBe(409)
    const path = `/v1/pickup/items/${PICKUP_NAME}`
    const read = await send(d, "GET", path)
    expect(read.status).toBe(200)
    expect(await read.text()).toBe(PICKUP)
    expect((await send(d, "GET", path, { token: HOME })).status).toBe(403)
    expect((await put(d, "pickup", PICKUP_NAME, { body: PICKUP })).status).toBe(
      403
    )
  })

  it("the routine neither lists archived pickups nor asks one back", async () => {
    const d = deps()
    expect((await asHome(d, PICKUP_NAME)).status).toBe(201)
    expect((await send(d, "GET", "/v1/pickup/archived")).status).toBe(403)
    expect(
      (await send(d, "PUT", `/v1/pickup/wanted/${PICKUP_NAME}`)).status
    ).toBe(403)
  })

  it("the routine puts its answer, which rings home, and home reads it; neither the other way", async () => {
    const rings: Array<Folder> = []
    const d = deps(memoryStore(), [], rings)
    expect((await asRoutine(d, PICKED_NAME)).status).toBe(201)
    expect(rings).toEqual(["picked"])
    expect((await asRoutine(d, PICKED_NAME)).status).toBe(200)
    expect(rings).toEqual(["picked"])
    const path = `/v1/picked/items/${PICKED_NAME}`
    const read = await send(d, "GET", path, { token: HOME })
    expect(read.status).toBe(200)
    expect(await read.text()).toBe(PICKED)
    expect(
      (await send(d, "GET", "/v1/picked/items", { token: HOME })).status
    ).toBe(200)
    expect(
      (await put(d, "picked", PICKED_NAME, { token: HOME, body: PICKED }))
        .status
    ).toBe(403)
  })

  it("takes a take with no labels, and with as many and as long as home keeps", async () => {
    const d = deps()
    const labelled = [
      [],
      Array.from({ length: 8 }, (_, n) => `l${n}`),
      ["a".repeat(32)],
      ["\u{1F600}".repeat(32)],
      // Home's trim (Rust's) keeps U+FEFF, so the mailbox takes it too.
      ["\uFEFFep04"],
    ]
    for (const [seq, labels] of labelled.entries()) {
      const body = JSON.stringify({ ...READY, seq: seq + 1, labels })
      const name = `pickup-${READY.note}-${seq + 1}.json`
      expect([labels, (await asHome(d, name, body)).status]).toEqual([
        labels,
        201,
      ])
    }
  })

  it("names a pickup and its answer only as <folder>-<note>-<seq>.json", async () => {
    const d = deps()
    // Each body carries its name, so only the name's own rule refuses it.
    for (const note of ["a".repeat(65), "a b"]) {
      for (const [folder, base, token] of [
        ["pickup", READY, HOME],
        ["picked", FILED, ROUTINE],
      ] as const) {
        const answer = await put(d, folder, `${folder}-${note}-3.json`, {
          token,
          body: JSON.stringify({ ...base, note, seq: 3 }),
        })
        expect([folder, note, await json(answer)]).toEqual([
          folder,
          note,
          { error: "the name does not fit this folder" },
        ])
      }
    }
    for (const [folder, base, token] of [
      ["pickup", READY, HOME],
      ["picked", FILED, ROUTINE],
    ] as const) {
      for (const name of [
        `${folder}-${base.note}.json`,
        `${folder}-${base.note}-0.json`,
        `${folder}-${base.note}-03.json`,
        `${folder}-${base.note}-3.txt`,
      ]) {
        const answer = await put(d, folder, name, {
          token,
          body: JSON.stringify(base),
        })
        expect([name, await json(answer)]).toEqual([
          name,
          { error: "the name does not fit this folder" },
        ])
      }
    }
  })

  it("takes only a pickup's own shape, and no comment", async () => {
    const d = deps()
    const shapes: ReadonlyArray<readonly [unknown, string]> = [
      [
        { ...READY, comment: "use the second half" },
        "comment is not part of a take ready for pickup",
      ],
      [
        { ...READY, audio: "T2dnUwACAAAAAAAA" },
        "a take carries no audio: home keeps the audio",
      ],
      [
        { ...READY, heard: `data:audio/webm;base64,${"A".repeat(40)}` },
        "a take carries no audio: home keeps the audio",
      ],
      [
        { ...READY, driveId: "1AbCdEf" },
        "a take names no Drive file: home keeps the audio",
      ],
      [{ ...READY, note: "a/b" }, "note must be the take's id"],
      [{ ...READY, seq: 0 }, "seq must be the ready-for-pickup move's number"],
      [
        { ...READY, seq: 1.5 },
        "seq must be the ready-for-pickup move's number",
      ],
      [
        { ...READY, seq: "3" },
        "seq must be the ready-for-pickup move's number",
      ],
      [
        { ...READY, seq: 2 ** 53 },
        "seq must be the ready-for-pickup move's number",
      ],
      [
        { ...READY, note: "another-take" },
        "the name must carry the take's id and the move's number",
      ],
      [
        { ...READY, seq: 4 },
        "the name must carry the take's id and the move's number",
      ],
      [{ ...READY, ref: "" }, "ref must name the shot the take belongs to"],
      [{ ...READY, heard: "  " }, "heard must be what home heard in the take"],
      [{ ...READY, heard: null }, "heard must be what home heard in the take"],
      ...[
        undefined,
        "ep04",
        [""],
        [" ep04"],
        ["ep04 "],
        // C1 controls inside a label, past the edge rule (U+0085 is also White_Space).
        ["x\u0085x"],
        ["a\u0080"],
        ["\u007f"],
        null,
        // Code points, as home counts them: 33 astral characters.
        ["\u{1F600}".repeat(33)],
        ["a".repeat(33)],
        ["tab\there"],
        [7],
        Array.from({ length: 9 }, (_, n) => `l${n}`),
      ].map(
        (labels) =>
          [
            { ...READY, labels },
            "labels must be the take's, at most 8, each 1 to 32 printable characters with no space at either end",
          ] as const
      ),
      [
        { ...READY, readyAt: "Thursday" },
        "readyAt must be when the take was moved to ready for pickup",
      ],
    ]
    for (const [body, why] of shapes) {
      const answer = await asHome(d, PICKUP_NAME, JSON.stringify(body))
      expect([body, answer.status]).toEqual([body, 422])
      expect(await json(answer)).toEqual({ error: why })
    }
  })

  it("takes only an answer's own shape", async () => {
    const d = deps()
    const shapes: ReadonlyArray<readonly [unknown, string]> = [
      [
        { ...FILED, labels: ["ep04"] },
        "labels is not part of a take picked up",
      ],
      [{ ...FILED, note: "a/b" }, "note must be the take's id"],
      [{ ...FILED, seq: 0 }, "seq must be the ready-for-pickup move's number"],
      [
        { ...FILED, note: "another-take" },
        "the name must carry the take's id and the move's number",
      ],
      [
        { ...FILED, seq: 4 },
        "the name must carry the take's id and the move's number",
      ],
      ...[
        "#2990",
        "paulgsc/some-ui",
        "paulgsc/some-ui#0",
        "paulgsc/some-ui#02",
        "https://github.com/paulgsc/some-ui/issues/2990",
        "paul gsc/some-ui#1",
        `${"a".repeat(101)}/some-ui#1`,
        "paulgsc/some-ui#1234567890",
        2990,
      ].map(
        (issue) =>
          [
            { ...FILED, issue },
            "issue must be the issue it was filed as, <owner>/<repo>#<n>",
          ] as const
      ),
    ]
    for (const [body, why] of shapes) {
      const answer = await asRoutine(d, PICKED_NAME, JSON.stringify(body))
      expect([body, answer.status]).toEqual([body, 422])
      expect(await json(answer)).toEqual({ error: why })
    }
  })
})

describe("a reflection or a prompt", () => {
  it.each([
    {
      folder: "reflection" as const,
      name: `reflection-${WRITTEN.reflection}.json`,
      body: WRITTEN,
      audio:
        "a reflection carries no audio: a spoken one goes as its transcript",
      drive: "a reflection names no Drive file",
    },
    {
      folder: "prompt" as const,
      name: `${STAMP}.prompt.json`,
      body: ASKED_FOR,
      audio:
        "a prompt carries no audio: its scene notes go as their transcripts",
      drive: "a prompt names no Drive file",
    },
  ])(
    "refuses a $folder that carries audio or names a Drive file, and says why",
    async ({ folder, name, body, audio, drive }) => {
      const d = deps()
      const refused: ReadonlyArray<readonly [unknown, string]> = [
        [{ ...body, audio: "T2dnUwACAAAAAAAA" }, audio],
        [{ ...body, text: "here data:audio/webm;base64,GkXfo59ChoEB" }, audio],
        [{ ...body, driveId: "1AbCdEf" }, drive],
        [
          { ...body, text: "see https://drive.google.com/file/d/1AbC/view" },
          drive,
        ],
      ]
      for (const [refusedBody, why] of refused) {
        const answer = await put(d, folder, name, {
          token: HOME,
          body: JSON.stringify(refusedBody),
        })
        expect(answer.status).toBe(422)
        expect(await json(answer)).toEqual({ error: why })
      }
    }
  )
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

describe("the bell (MBP1: MB2, MB6)", () => {
  const UPGRADE = { upgrade: "websocket" }
  const SCENE = JSON.stringify({
    schema: "some-ui.routine-scene/1",
    answers: "2026-10-13_morning-drama_session-",
    title: "t",
    decks: [],
  })

  it("only home listens, and a token is checked before anything else", async () => {
    const { store, touched } = untouchable()
    const d = deps(store)
    expect(
      (await send(d, "GET", "/v1/bell", { token: null, headers: UPGRADE }))
        .status
    ).toBe(401)
    expect(
      (await send(d, "GET", "/v1/bell", { token: "wrong", headers: UPGRADE }))
        .status
    ).toBe(401)
    for (const token of [ROUTINE, ARCHIVE]) {
      const response = await send(d, "GET", "/v1/bell", {
        token,
        headers: UPGRADE,
      })
      expect([token, response.status]).toEqual([token, 403])
    }
    const home = await send(d, "GET", "/v1/bell", {
      token: HOME,
      headers: UPGRADE,
    })
    expect(home.status).toBe(200)
    expect(await home.text()).toBe("listening")
    // Listening reads nothing from the store: no D1 quota for a connection.
    expect(touched()).toBe(0)
  })

  it("is a WebSocket, on GET only", async () => {
    const d = deps(untouchable().store)
    const plain = await send(d, "GET", "/v1/bell", { token: HOME })
    expect(plain.status).toBe(426)
    expect(plain.headers.get("upgrade")).toBe("websocket")
    for (const method of ["PUT", "POST", "DELETE"]) {
      const response = await send(d, method, "/v1/bell", {
        token: HOME,
        headers: UPGRADE,
      })
      expect([method, response.status]).toEqual([method, 405])
      expect(response.headers.get("allow")).toBe("GET")
    }
    // The bell is the exact path only.
    const near = await send(d, "GET", "/v1/bell/", {
      token: HOME,
      headers: UPGRADE,
    })
    expect(near.status).toBe(404)
  })

  it("a bell that fails to answer is a 503, reported", async () => {
    const reported: Array<unknown> = []
    const d: Deps = {
      ...deps(untouchable().store, reported),
      bell: {
        listen: () => Promise.reject(new Error("no bell")),
        ring: (): void => undefined,
      },
    }
    const response = await send(d, "GET", "/v1/bell", {
      token: HOME,
      headers: UPGRADE,
    })
    expect(response.status).toBe(503)
    expect(reported).toHaveLength(1)
  })

  it("rings with the folder when a file is added to a folder home reads", async () => {
    const rings: Array<Folder> = []
    const d = deps(memoryStore(), [], rings)
    expect((await put(d, "brief", DIGEST_NAME, { body: DIGEST })).status).toBe(
      201
    )
    expect(rings).toEqual(["brief"])
    // The same bytes again change nothing, so nothing rings.
    expect((await put(d, "brief", DIGEST_NAME, { body: DIGEST })).status).toBe(
      200
    )
    // Other bytes are refused, and nothing rings.
    const other = JSON.stringify({ schema: "some-ui.job-digest/1", picks: [1] })
    expect((await put(d, "brief", DIGEST_NAME, { body: other })).status).toBe(
      409
    )
    expect(
      (
        await put(d, "scene", "scene-2026-10-13_morning-drama_session-.json", {
          body: SCENE,
        })
      ).status
    ).toBe(201)
    expect(rings).toEqual(["brief", "scene"])
  })

  it("does not ring for a folder home does not read, or a put refused", async () => {
    const rings: Array<Folder> = []
    const d = deps(memoryStore(), [], rings)
    expect(
      (
        await put(d, "decisions", DECISIONS_NAME, {
          body: DECISIONS,
          token: HOME,
        })
      ).status
    ).toBe(201)
    expect(
      (await put(d, "scout", SCOUTS_NAME, { body: SCOUTS, token: HOME })).status
    ).toBe(201)
    expect((await put(d, "brief", "nope.json", { body: DIGEST })).status).toBe(
      422
    )
    expect(
      (await put(d, "brief", DIGEST_NAME, { body: DIGEST, token: HOME })).status
    ).toBe(403)
    expect(rings).toEqual([])
  })

  it("rings with the folder when the routine asks for an archived file, once", async () => {
    const rings: Array<Folder> = []
    let now = NOW
    const d: Deps = { ...deps(memoryStore(), [], rings), now: () => now }
    await put(d, "brief", DIGEST_NAME, { body: DIGEST })
    now = new Date(NOW.getTime() + ARCHIVE_MIN_AGE_DAYS * 86_400_000)
    const sha = createHash("sha256").update(DIGEST).digest("hex")
    expect(
      (
        await send(d, "DELETE", `/v1/brief/items/${DIGEST_NAME}`, {
          token: ARCHIVE,
          headers: { "if-match": `"${sha}"` },
        })
      ).status
    ).toBe(200)
    expect(rings).toEqual(["brief"])
    const ask = (): Promise<Response> =>
      send(d, "PUT", `/v1/brief/wanted/${DIGEST_NAME}`)
    expect((await ask()).status).toBe(202)
    expect(rings).toEqual(["brief", "brief"])
    expect((await ask()).status).toBe(200)
    // Home puts it back with the archive token: home's own act, so no ring.
    expect(
      (await put(d, "brief", DIGEST_NAME, { body: DIGEST, token: ARCHIVE }))
        .status
    ).toBe(201)
    expect(rings).toEqual(["brief", "brief"])
  })

  it("a ring that fails is reported and never changes the answer", async () => {
    const reported: Array<unknown> = []
    const d: Deps = {
      ...deps(memoryStore(), reported),
      bell: {
        listen: () => Promise.reject(new Error("unused")),
        ring: (): void => {
          throw new Error("no bell")
        },
      },
    }
    const response = await put(d, "brief", DIGEST_NAME, { body: DIGEST })
    expect(response.status).toBe(201)
    expect(await json(response)).toEqual({ change: "added", seq: 1 })
    expect(reported).toHaveLength(1)
  })

  it("rings for exactly what home reads: paulgsc/server's pass::READS, which lives in the other repo", () => {
    // `picked` is ahead of pass::READS until home's half of CONVEYOR3 adds it
    // there (paulgsc/some-ui#2875); until then a `picked` ring runs a plain pass.
    expect(RINGS).toEqual([
      "brief",
      "scene",
      "drama",
      "run",
      "leetype",
      "picked",
    ])
  })

  it("a ring names its folder and nothing else (MB6)", () => {
    expect(ringMessage("run")).toBe('{"ring":"run"}')
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
    for (const folder of [
      "brief",
      "decisions",
      "scout",
      "scene",
      "drama",
      "run",
      "opened",
      "leetype",
      "leetype-log",
      "transcript",
      "reflection",
      "prompt",
      "feedback",
      "pickup",
      "picked",
    ]) {
      expect(
        (await send(d, "GET", `/v1/${folder}/items`, { token: ARCHIVE })).status
      ).toBe(200)
      expect(
        (await send(d, "GET", `/v1/${folder}/wanted`, { token: ARCHIVE }))
          .status
      ).toBe(200)
    }
    // Home's index is read too; that nothing archives it is "home's indexes".
    expect(
      (await send(d, "GET", "/v1/index/items", { token: ARCHIVE })).status
    ).toBe(200)
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

describe("the backfill's last day", () => {
  it("is the day job-desk's index check holds too, which neither file can import", () => {
    const bound = (path: string): string | undefined =>
      /const DRIVE_ONLY_ENDED = "(\d{4}-\d{2}-\d{2})"/.exec(
        readFileSync(fileURLToPath(new URL(path, import.meta.url).href), "utf8")
      )?.[1]
    const worker = bound("../core.ts")
    expect(worker).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(bound("../../../../packages/job-desk/src/home-index.ts")).toBe(
      worker
    )
  })
})
