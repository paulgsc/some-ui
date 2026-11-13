import {
  callsOf,
  docsOf,
  epicsOf,
  invariantsOf,
} from "@interview-week/lib/monday/corpus"
import {
  EMPLOYERS,
  employersIn,
  resumeEmployers,
} from "@interview-week/lib/monday/employers"
import { describe, expect, it } from "vitest"

const call = (id: string, made: string): Record<string, unknown> => ({
  id,
  made,
  by: "claude",
  paths: [],
  chose: `chose ${id}`,
  options: ["(a)", "(b)"],
  gray: "gray",
  undo: "undo",
})

describe("the corpus", () => {
  it("reads the calls record newest first", () => {
    const text = JSON.stringify({
      schema: "some-ui.calls/1",
      calls: [
        call("C9", "2026-11-01"),
        call("C12", "2026-11-13"),
        call("C11", "2026-11-13"),
      ],
    })
    expect(callsOf(text).map((c) => c.id)).toEqual(["C12", "C11", "C9"])
    expect(callsOf(text)[0]?.refs).toEqual([])
  })

  it("reads each declared invariant's block, in a blockquote or not, and never a retired one", () => {
    const docs = [
      {
        path: "CLAUDE.md",
        text: [
          "## Section",
          "",
          "> **RS1: the resync workflow only reads and dispatches.**",
          ">",
          "> - _Claim:_ it reads.",
          ">",
          "> **RS2 (not reviewable): nothing else writes it.**",
          "> - _Claim:_ nothing else.",
          "",
          "## Next",
          "**L3 (retired): gone.**",
        ].join("\n"),
      },
      { path: "other.md", text: "**RS1: a second declaration.**\n" },
    ]
    const found = invariantsOf(docs)
    expect(found.map((i) => [i.id, i.path, i.title])).toEqual([
      [
        "RS1",
        "CLAUDE.md",
        "RS1: the resync workflow only reads and dispatches.",
      ],
      ["RS2", "CLAUDE.md", "RS2: nothing else writes it."],
    ])
    expect(found[0]?.text).toBe(
      "**RS1: the resync workflow only reads and dispatches.**\n\n- _Claim:_ it reads."
    )
    expect(found[1]?.text).toBe(
      "**RS2 (not reviewable): nothing else writes it.**\n- _Claim:_ nothing else."
    )
  })

  it("takes docs from docs/ only, titled by their first heading", () => {
    const docs = docsOf([
      { path: "docs/b.md", text: "intro\n# Bee\n" },
      { path: "README.md", text: "# Root" },
      { path: "docs/a.md", text: "no heading" },
      { path: "docs/calls.json", text: "{}" },
    ])
    expect(docs.map((d) => [d.key, d.title])).toEqual([
      ["doc:docs/a.md", "docs/a.md"],
      ["doc:docs/b.md", "Bee"],
    ])
  })

  it("takes an epic with a Why, newest first", () => {
    const epics = epicsOf([
      {
        repo: "some-ui",
        number: 1,
        title: "old",
        why: "because",
        whereWeAre: null,
      },
      {
        repo: "server",
        number: 9,
        title: "new",
        why: "for this",
        whereWeAre: "here",
      },
      {
        repo: "some-ui",
        number: 5,
        title: "no why",
        why: null,
        whereWeAre: "here",
      },
    ])
    expect(epics.map((e) => [e.key, e.text])).toEqual([
      ["issue:server#9", "Why:\nfor this\n\nWhere we are:\nhere"],
      ["issue:some-ui#1", "Why:\nbecause"],
    ])
  })
})

describe("the employers a week never names", () => {
  it("takes the résumé's employers, never this repo's own project", () => {
    const text =
      '"org": "Harbour Works",\n"org": "paulgsc/server · paulgsc/some-ui",\n"org": "Harbour Works"'
    expect(resumeEmployers(text)).toEqual(["Harbour Works"])
  })

  it("matches a name as written, never inside a word or in lower case", () => {
    expect(employersIn("I left Meta in May.", EMPLOYERS)).toEqual(["Meta"])
    expect(employersIn("The metadata and a meta point.", EMPLOYERS)).toEqual([])
    expect(employersIn("Uberwald", EMPLOYERS)).toEqual([])
  })
})
