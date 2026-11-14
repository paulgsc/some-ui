import { parseAskId } from "@video-render/ask"
import {
  answerRef,
  FiledSchema,
  HEARD_WITHIN_MS,
  pendingOfRef,
  pickedAnswer,
  toFile,
} from "@video-render/pending"
import { describe, expect, it } from "vitest"

const heard = (over: Record<string, unknown>): unknown => ({
  schema: "some-ui.voice-transcript/1",
  note: "n1",
  of: "studio",
  ref: answerRef({ repo: "some-ui", number: 2676 }),
  at: "2026-11-08T18:00:00.000Z",
  text: "the second one",
  language: "en",
  model: "small",
  heardAt: "2026-11-08T18:01:00.000Z",
  ...over,
})

describe("an answer's ref", () => {
  it("names the ask by its id and reads back to it, for both repositories", () => {
    expect(answerRef({ repo: "some-ui", number: 2676 })).toBe(
      "ask:some-ui-2676"
    )
    for (const repo of ["some-ui", "server"] as const)
      expect(pendingOfRef(answerRef({ repo, number: 725 }))).toEqual({
        kind: "ask",
        repo,
        about: 725,
      })
  })

  it("reads nothing from another take's ref, or an ask of no repository", () => {
    for (const ref of [
      "take:abc",
      "idea:i1:why",
      "build-journal-ep04:s3:2",
      "ask:some-ui",
      "ask:some-ui-0",
      "ask:other-12",
    ])
      expect(pendingOfRef(ref), ref).toBeNull()
    expect(parseAskId("server-725")).toEqual({ repo: "server", number: 725 })
  })
})

describe("toFile", () => {
  it("files each answer, oldest said first, whatever the clock's offset", () => {
    const { items } = toFile(
      [
        heard({ note: "n2", at: "2026-11-08T12:30:00-07:00" }),
        heard({ note: "n1", at: "2026-11-08T19:00:00Z" }),
      ],
      []
    )
    expect(items.map((item) => item.note)).toEqual(["n1", "n2"])
    expect(items[0]?.line).toBe("Kept on home as the take `n1`.")
  })

  it("never files a take an issue already carries, open or closed", () => {
    const body = `The owner chose the second option.\n\nKept on home as the take \`n1\`.`
    expect(toFile([heard({})], [body]).items).toEqual([])
    expect(
      toFile([heard({})], ["mentions `n1` in passing"]).items
    ).toHaveLength(1)
    const edited = `Kept on home as the take \`n1\`.\r\nEdited on GitHub.`
    expect(toFile([heard({})], [edited]).items).toEqual([])
    expect(
      toFile([heard({ text: "first" }), heard({ text: "again" })], []).items
    ).toMatchObject([{ heard: "again" }])
  })

  it("leaves out every other kind of note, and reports what doesn't read", () => {
    const { items, passed } = toFile(
      [
        heard({ of: "reflection", ref: "session-1" }),
        heard({ ref: "take:t1" }),
        heard({ text: "  " }),
      ],
      []
    )
    expect(items).toEqual([])
    expect(passed.map((each) => each.place)).toEqual([2])
  })
})

const note = (over: Record<string, unknown> = {}): unknown => ({
  schema: "some-ui.episode-note/1",
  note: "e1",
  feed: "call",
  episode: "2026-11-13",
  atMs: 134_000,
  categories: ["shallow", "textClipped", "musicLoud"],
  take: null,
  writtenAt: "2026-11-14T03:00:00.000Z",
  ...over,
})

describe("toFile, notes on episodes (SFEED6)", () => {
  it("files one issue per place a note goes, each with the categories that send it there", () => {
    const { items, passed } = toFile([], [], [note()])
    expect(passed).toEqual([])
    expect(
      items.map((item) =>
        item.kind === "feedback" ? [item.goes, item.categories] : null
      )
    ).toEqual([
      ["nextFill", ["shallow"]],
      ["template", ["musicLoud"]],
      ["defect", ["textClipped"]],
    ])
    expect(items[0]).toMatchObject({
      repo: "some-ui",
      note: "e1",
      atMs: 134_000,
      heard: null,
      labels: ["pending", "from-studio"],
      line: "Kept on home as the note `e1`, for the next fill.",
    })
  })

  it("files no place an issue already ends with, and only those", () => {
    const { items } = toFile(
      [],
      ["…\r\n\r\nKept on home as the note `e1`, for the template.\r\n"],
      [note()]
    )
    expect(
      items.map((i) => (i.kind === "feedback" ? [i.goes, i.filed] : null))
    ).toEqual([
      ["nextFill", ["template"]],
      ["defect", ["template"]],
    ])
  })

  it("waits up to two days for home to hear a spoken note, then files it saying so", () => {
    const spoken = [note({ take: "t1", categories: ["pacing"] })]
    const written = Date.parse("2026-11-14T03:00:00.000Z")
    const soon = toFile([], [], spoken, written + 60_000)
    expect([soon.items, soon.waiting]).toEqual([[], ["e1"]])
    const late = toFile([], [], spoken, written + HEARD_WITHIN_MS)
    expect(late.waiting).toEqual([])
    expect(late.items[0]).toMatchObject({ take: "t1", heard: null })
  })

  it("carries what home heard in a spoken note, from its take's transcript", () => {
    const { items } = toFile(
      [heard({ note: "t1", of: "studio", ref: "take:t1", text: "too fast" })],
      [],
      [note({ take: "t1", categories: ["pacing"] })]
    )
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: "feedback", heard: "too fast" })
  })

  it("passes a note that doesn't read, by its place in the feedback list", () => {
    const { items, passed } = toFile([], [], [note({ categories: ["loud"] })])
    expect(items).toEqual([])
    expect(passed).toEqual([
      {
        place: 0,
        why: "it doesn't read as a note on an episode",
        in: "feedback",
      },
    ])
  })
})

const ready = (over: Record<string, unknown>): unknown => ({
  schema: "some-ui.take-pickup/1",
  note: "t1",
  ref: "build-journal:ep04:2",
  heard: "open on the conveyor page",
  labels: ["ep04"],
  readyAt: "2026-11-14T01:00:00.000Z",
  seq: 3,
  ...over,
})

/** `toFile` with only pickups, as `render pending` passes them. */
const pickupsOnly = (
  pickups: ReadonlyArray<unknown>,
  filed: Parameters<typeof toFile>[1] = [],
  picked: ReadonlyArray<string> = []
): ReturnType<typeof toFile> =>
  toFile([], filed, [], Date.parse("2026-11-14T02:00:00Z"), pickups, picked)

describe("toFile, takes ready for pickup (CONVEYOR3)", () => {
  it("files each take once, from its newest move, with its labels as context and where its answer goes", () => {
    const { items, answers } = pickupsOnly([
      ready({ seq: 3 }),
      ready({ seq: 5, labels: ["ep04", "opening"] }),
      ready({ note: "t0", readyAt: "2026-11-13T09:00:00Z", labels: [] }),
    ])
    expect(items).toEqual([
      expect.objectContaining({ kind: "pickup", note: "t0", seq: 3 }),
      {
        kind: "pickup",
        repo: "some-ui",
        note: "t1",
        seq: 5,
        ref: "build-journal:ep04:2",
        at: "2026-11-14T01:00:00.000Z",
        heard: "open on the conveyor page",
        takeLabels: ["ep04", "opening"],
        labels: ["pending", "from-studio"],
        line: "Kept on home as the take `t1`.",
        picked: "picked-t1-5.json",
      },
    ])
    expect(answers).toEqual([])
  })

  it("files no second issue for a take filed already, and answers with that one", () => {
    const body = "Said in Studio.\n\nKept on home as the take `t1`."
    const { items, answers, unanswered } = pickupsOnly(
      [ready({}), ready({ note: "t2" })],
      [
        { body, issue: "paulgsc/some-ui#3001" },
        "An older one.\n\nKept on home as the take `t2`.",
      ]
    )
    expect(items).toEqual([])
    expect(answers).toEqual([pickedAnswer("t1", 3, "paulgsc/some-ui#3001")])
    expect(answers[0]).toEqual({
      name: "picked-t1-3.json",
      body: {
        schema: "some-ui.take-picked/1",
        note: "t1",
        seq: 3,
        issue: "paulgsc/some-ui#3001",
      },
    })
    // Filed, but the list didn't say where: said, never filed again.
    expect(unanswered).toEqual(["t2"])
  })

  it("answers a take filed this run as an answer to an ask on the next run, never with a second issue", () => {
    const ask = heard({ note: "t1" })
    const { items, unanswered } = toFile(
      [ask],
      [],
      [],
      Date.parse("2026-11-14T02:00:00Z"),
      [ready({})]
    )
    expect(items.map((item) => item.kind)).toEqual(["ask"])
    expect(unanswered).toEqual(["t1"])
  })

  it("puts no answer the picked folder holds already", () => {
    const body = "Kept on home as the take `t1`."
    expect(
      pickupsOnly(
        [ready({})],
        [{ body, issue: "paulgsc/some-ui#3001" }],
        ["picked-t1-3.json"]
      ).answers
    ).toEqual([])
    // An answer to an older move is no answer to the newest.
    expect(
      pickupsOnly(
        [ready({ seq: 5 })],
        [{ body, issue: "paulgsc/some-ui#3001" }],
        ["picked-t1-3.json"]
      ).answers
    ).toEqual([pickedAnswer("t1", 5, "paulgsc/some-ui#3001")])
    // A take not filed whose answer is there is left alone.
    expect(pickupsOnly([ready({})], [], ["picked-t1-3.json"]).items).toEqual([])
  })

  it("counts a take's newest move, in whatever order home put them", () => {
    const { items } = pickupsOnly([ready({ seq: 5 }), ready({ seq: 3 })])
    expect(items).toMatchObject([{ note: "t1", seq: 5 }])
  })

  it("answers with an issue the list says where to find, wherever it is in the list", () => {
    const body = "Kept on home as the take `t1`."
    expect(
      pickupsOnly(
        [ready({})],
        [body, { body, issue: "paulgsc/server#77" }, { body, issue: null }]
      ).answers
    ).toEqual([pickedAnswer("t1", 3, "paulgsc/server#77")])
  })

  it("reads where a filed issue is from its repository and number, or its html_url", () => {
    const parse = (raw: unknown): unknown => FiledSchema.parse(raw)
    expect(parse({ repo: "paulgsc/some-ui", number: 3001, body: "b" })).toEqual(
      { body: "b", issue: "paulgsc/some-ui#3001" }
    )
    expect(
      parse({
        body: null,
        html_url: "https://github.com/paulgsc/server/issues/77",
      })
    ).toEqual({ body: "", issue: "paulgsc/server#77" })
    // As GitHub's issue list gives it, with no repository: no issue to name.
    expect(parse({ number: 3001, body: "b" })).toEqual({
      body: "b",
      issue: null,
    })
    expect(
      parse({
        body: "b",
        html_url: "https://github.com/paulgsc/some-ui/pull/9",
      })
    ).toEqual({ body: "b", issue: null })
    expect(
      parse({ repo: `paulgsc/${"a".repeat(101)}`, number: 1, body: "b" })
    ).toEqual({ body: "b", issue: null })
    expect(parse({ repo: "some-ui", number: 3001, body: "b" })).toEqual({
      body: "b",
      issue: null,
    })
    // Past what the mailbox takes as an issue: unknown, never a refused answer.
    expect(parse({ repo: "paulgsc/some-ui", number: 1e9, body: "b" })).toEqual({
      body: "b",
      issue: null,
    })
    expect(
      parse({
        body: "b",
        html_url: "https://github.com/paulgsc/some-ui/issues/1234567890",
      })
    ).toEqual({ body: "b", issue: null })
    expect(
      parse({
        body: "b",
        html_url: `https://github.com/${"a".repeat(101)}/some-ui/issues/1`,
      })
    ).toEqual({ body: "b", issue: null })
    expect(parse("just a body")).toBe("just a body")
  })

  it("passes a pickup that doesn't read, by its place in the pickup list", () => {
    const { items, passed } = pickupsOnly([
      ready({}),
      ready({ heard: " " }),
      ready({ seq: 0 }),
      { schema: "some-ui.take-picked/1" },
    ])
    expect(items).toHaveLength(1)
    expect(passed).toEqual(
      [1, 2, 3].map((place) => ({
        place,
        why: "it doesn't read as a take ready for pickup",
        in: "pickup",
      }))
    )
  })

  it("files nothing from a transcript alone: a take is filed only once marked ready", () => {
    const take = heard({ ref: "build-journal:ep04:2", note: "t1" })
    expect(toFile([take], []).items).toEqual([])
  })
})
