import type {
  Check,
  Ledger,
  Objective,
  Process,
  Segment,
} from "@assurance/ledger"
import { parseLedger } from "@assurance/ledger"
import ledgerJson from "@assurance/ledger.json"
import { findProcessViolations } from "@assurance/processes"
import { describe, expect, it } from "vitest"

const objective = (id: string, overrides: Partial<Objective> = {}): Objective =>
  ({
    id,
    kind: "OA2",
    property: "outcome",
    claim: "A note is heard.",
    requirement: "Every note gets a transcript or a reason.",
    verdict: "unproven",
    conclusion: "Not known.",
    evidence: [{ class: "unknown", says: "Nothing measures it." }],
    tracked: "some-ui#1",
    watch: { by: "none" },
    amendments: [],
    ...overrides,
  }) satisfies Objective

const segment = (id: string, overrides: Partial<Segment> = {}): Segment => ({
  id,
  name: "A stretch.",
  owner: "ours",
  on: "home",
  paths: ["some-ui:src"],
  ...overrides,
})

const check = (overrides: Partial<Check> = {}): Check => ({
  id: "probe",
  kind: "probe",
  name: "A known clip.",
  runs: "home",
  segments: ["heard/pass"],
  status: "planned",
  tracked: "some-ui#2383",
  ...overrides,
})

const process = (overrides: Partial<Process> = {}): Process => ({
  id: "heard",
  name: "Home hears notes",
  why: "Why.",
  serves: ["voice"],
  witnesses: ["VH1"],
  segments: [segment("pass"), segment("engine", { owner: "foreign" })],
  signals: [
    { says: "A row per note.", status: "planned", tracked: "some-ui#2381" },
  ],
  checks: [check()],
  ...overrides,
})

const ledgerOf = (
  processes: ReadonlyArray<Process>,
  overrides: Partial<Ledger> = {}
): Ledger => ({
  schema: "some-ui.assurance-ledger/1",
  families: [
    {
      id: "voice",
      name: "Voice",
      why: "Why.",
      paths: [],
      modules: [],
      objectives: [
        objective("VH1"),
        objective("VH9", { retired: { on: "2026-10-30", why: "Gone." } }),
      ],
    },
    {
      id: "checks",
      name: "Checks",
      why: "Why.",
      paths: [],
      modules: [],
      objectives: [objective("GC1")],
    },
  ],
  synchronous: [],
  stores: [],
  processes,
  crosscutting: [{ family: "checks", why: "Spans every process." }],
  ...overrides,
})

const around = {
  exists: (path: string): boolean => path === "src" || path === "src/probe.ts",
}

const errors = (ledger: Ledger): string =>
  findProcessViolations(ledger, around)
    .filter((f) => f.level === "error")
    .map((f) => `${f.id}: ${f.message}`)
    .join("\n")

const warnings = (ledger: Ledger): string =>
  findProcessViolations(ledger, around)
    .filter((f) => f.level === "warning")
    .map((f) => `${f.id}: ${f.message}`)
    .join("\n")

describe("the registry's shape", () => {
  it("reads a process with its segments, signals and checks", () => {
    const parsed = parseLedger(ledgerOf([process()]))
    expect(parsed.ok && parsed.ledger.processes[0]?.checks[0]?.kind).toBe(
      "probe"
    )
  })

  it("names an unknown kind, place and field, and a process with no segments", () => {
    const raw = {
      ...ledgerOf([]),
      processes: [
        {
          ...process({ segments: [] }),
          checks: [{ ...check(), kind: "smoke" }],
          signals: [{ says: "x", status: "soon" }],
          owner: "me",
        },
        {
          ...process({ id: "other" }),
          segments: [{ ...segment("a"), on: "cloud" }],
        },
      ],
    }
    const parsed = parseLedger(raw)
    const problems = parsed.ok ? "" : parsed.problems.join("\n")
    expect(problems).toContain("has no segments")
    expect(problems).toContain(
      "a kind (probe, phone-check, guided, journey, monitor)"
    )
    expect(problems).toContain("a status (live, planned)")
    expect(problems).toContain('unknown field "owner"')
    expect(problems).toContain(
      "on (phone, browser, home, mailbox, outside, between)"
    )
  })

  it("reads a watch's checks", () => {
    const parsed = parseLedger(
      ledgerOf([process()], {
        families: [
          {
            id: "voice",
            name: "Voice",
            why: "Why.",
            paths: [],
            modules: [],
            objectives: [
              objective("VH1", {
                watch: { by: "dashboard", checks: ["heard/probe"] },
              }),
            ],
          },
        ],
      })
    )
    expect(
      parsed.ok && parsed.ledger.families[0]?.objectives[0]?.watch.checks
    ).toEqual(["heard/probe"])
  })
})

describe("findProcessViolations", () => {
  it("passes a registry whose every name points at something", () => {
    expect(errors(ledgerOf([process()]))).toBe("")
  })

  it("fails a family no process serves and that is not crosscutting, so a new family needs its process", () => {
    expect(errors(ledgerOf([process({ serves: [] })]))).toContain(
      "voice: no process in the registry serves this family"
    )
    expect(errors(ledgerOf([process()], { crosscutting: [] }))).toContain(
      "checks: no process in the registry serves this family"
    )
  })

  it("fails a family that is both crosscutting and served, and a crosscutting family that is gone", () => {
    expect(
      errors(ledgerOf([process({ serves: ["voice", "checks"] })]))
    ).toContain('"checks" is crosscutting and served by a process')
    expect(
      errors(
        ledgerOf([process()], {
          crosscutting: [
            { family: "checks", why: "x" },
            { family: "gone", why: "x" },
          ],
        })
      )
    ).toContain('crosscutting "gone" is no family in the ledger')
  })

  it.each([
    [{ serves: ["voice", "nothing"] }, 'serves "nothing", which is no family'],
    [{ witnesses: ["ZZ9"] }, 'witnesses "ZZ9", which is no objective'],
    [{ witnesses: ["VH9"] }, "witnesses VH9, which has retired"],
    [{ id: "Heard" }, "a process id is lowercase words"],
    [
      { segments: [segment("pass"), segment("pass")] },
      "segment id is used twice",
    ],
    [
      { segments: [segment("pass", { owner: "network" })] },
      "a network segment, and only one, runs between two places",
    ],
    [
      { segments: [segment("pass", { on: "between" })] },
      "a network segment, and only one, runs between two places",
    ],
    [
      { segments: [segment("pass", { on: "outside" })] },
      "a segment of ours runs on a place of ours",
    ],
    [
      { segments: [segment("pass", { paths: ["some-ui:gone"] })] },
      "path gone does not exist",
    ],
    [
      { segments: [segment("pass", { paths: ["src"] })] },
      'path "src" is some-ui:<path> or server:<path>',
    ],
    [
      { signals: [{ says: "x", status: "live" as const }] },
      "is live, so it names a ref",
    ],
    [
      { signals: [{ says: "x", status: "planned" as const, tracked: "#1" }] },
      "is planned, so it names its issue",
    ],
    [
      { checks: [check({ status: "live", tracked: undefined })] },
      "is live, so it names a ref",
    ],
    [
      { checks: [check({ status: "live", ref: "some-ui:src/gone.ts" })] },
      "ref src/gone.ts does not exist",
    ],
    [
      { checks: [check({ tracked: undefined })] },
      "is planned, so it names its issue",
    ],
    [{ checks: [check({ segments: [] })] }, "names the segments it exercises"],
    [
      { checks: [check({ segments: ["heard/pass", "heard/nowhere"] })] },
      'segment "heard/nowhere" is no <process>/<segment>',
    ],
    [{ checks: [check(), check()] }, "check id is used twice in its process"],
  ])("fails %o", (overrides, expected) => {
    expect(errors(ledgerOf([process(overrides)]))).toContain(expected)
  })

  it("fails a check that exercises none of its own process's segments", () => {
    const other = process({
      id: "going",
      serves: [],
      witnesses: [],
      segments: [segment("lane", { on: "phone" })],
      checks: [check({ segments: ["heard/pass"] })],
    })
    expect(errors(ledgerOf([process(), other]))).toContain(
      "exercises at least one segment of going"
    )
  })

  it("lets a server path stand: the server's own job checks those", () => {
    expect(
      errors(
        ledgerOf([
          process({
            segments: [
              segment("pass", { paths: ["server:apps/x/src/transcribe"] }),
            ],
          }),
        ])
      )
    ).toBe("")
  })

  it("lets a watch name only a live check of a process that witnesses the objective", () => {
    const watched = (
      checks: ReadonlyArray<string>,
      p: Process = process({
        checks: [
          check({
            status: "live",
            ref: "some-ui:src/probe.ts",
            tracked: undefined,
          }),
        ],
      })
    ): Ledger =>
      ledgerOf([p], {
        families: [
          {
            id: "voice",
            name: "Voice",
            why: "Why.",
            paths: [],
            modules: [],
            objectives: [
              objective("VH1", { watch: { by: "dashboard", checks } }),
              objective("VH2"),
            ],
          },
          {
            id: "checks",
            name: "Checks",
            why: "Why.",
            paths: [],
            modules: [],
            objectives: [objective("GC1")],
          },
        ],
      })
    expect(errors(watched(["heard/probe"]))).toBe("")
    expect(errors(watched(["heard/gone"]))).toContain(
      'watch check "heard/gone" is no <process>/<check>'
    )
    expect(errors(watched(["heard/probe"], process()))).toContain(
      "is planned, so it watches nothing yet"
    )
    expect(
      errors(
        watched(
          ["heard/probe"],
          process({
            witnesses: ["VH2"],
            checks: [
              check({
                status: "live",
                ref: "some-ui:src/probe.ts",
                tracked: undefined,
              }),
            ],
          })
        )
      )
    ).toContain("which does not witness VH1")
  })

  it("reports, without failing, a process nothing shows working", () => {
    const quiet = process({ signals: [], checks: [], witnesses: [] })
    expect(errors(ledgerOf([quiet]))).toBe("")
    const said = warnings(ledgerOf([quiet]))
    expect(said).toContain("heard: nothing real use leaves shows it working")
    expect(said).toContain("heard: no check can run it")
    expect(said).toContain("heard: witnesses no promise in the ledger yet")
  })

  it("counts a check another process lists as running this one", () => {
    const going = process({
      id: "going",
      serves: [],
      witnesses: [],
      segments: [segment("lane", { on: "phone" })],
      checks: [
        check({
          id: "clip",
          runs: "phone",
          kind: "phone-check",
          segments: ["going/lane", "heard/pass"],
        }),
      ],
    })
    const heard = process({ checks: [] })
    expect(warnings(ledgerOf([heard, going]))).not.toContain(
      "heard: no check can run it"
    )
  })
})

describe("the registry in the ledger", () => {
  it("lists the voice families, each with its segments and a check or a signal", () => {
    const parsed = parseLedger(ledgerJson)
    if (!parsed.ok) throw new Error(parsed.problems.join("\n"))
    const ids = parsed.ledger.processes.map((p) => p.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        "phone-recording",
        "recognizer",
        "device-speech",
        "hosted-speech",
        "voice-going-home",
        "home-transcription",
        "mailbox-passes",
        "morning-run",
      ])
    )
    for (const p of parsed.ledger.processes) {
      expect(p.segments.length, p.id).toBeGreaterThan(0)
      expect(p.signals.length + p.checks.length, p.id).toBeGreaterThan(0)
    }
  })
})
