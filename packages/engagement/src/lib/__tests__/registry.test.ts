import { EVENT_KINDS, VISIT_ENDINGS } from "@engagement/lib/events"
import { PIPELINES, UNMEASURED } from "@engagement/lib/pipelines"
import type { Affordance, Pipeline } from "@engagement/lib/registry"
import { findRegistryProblems } from "@engagement/lib/registry"
import { describe, expect, it } from "vitest"

/** Machinery's words, which never reach the owner (CLAUDE.md, "State in the person's terms"). */
const MACHINERY =
  /\b(event|events|telemetry|funnel|affordance|pipeline|route|sync|grant|status|payload|id)\b/i

const affordance = (over: Partial<Affordance> = {}): Affordance => ({
  id: "a-thing",
  surface: "apk",
  name: "A thing",
  routes: ["/somewhere"],
  offer: "listed",
  emits: ["offered", "taken", "passed-over"],
  touches: true,
  ...over,
})

const pipeline = (affordances: ReadonlyArray<Affordance>): Pipeline => ({
  id: "a-pipeline",
  name: "A pipeline",
  wing: "practice",
  domain: "practice",
  affordances,
})

describe("the registry", () => {
  it("holds its own shape", () => {
    expect(findRegistryProblems(PIPELINES, UNMEASURED)).toEqual([])
  })

  it("lists every pipeline the epic names, in every wing that holds one", () => {
    expect(PIPELINES.map((p) => p.id)).toEqual(
      expect.arrayContaining([
        "topik",
        "rust-rounds",
        "leetype",
        "honeycomb",
        "studio",
        "playoff-delta",
        "game-day",
        "jobs",
        "aph",
        "lessons",
        "resume",
      ])
    )
    expect(new Set(PIPELINES.map((p) => p.wing))).toEqual(
      new Set(["practice", "self", "studio", "jobs", "operate"])
    )
  })

  it("names everything in the owner's words", () => {
    const words = [
      ...PIPELINES.flatMap((p) => [
        p.name,
        ...p.affordances.flatMap((a) => [
          a.name,
          ...(a.places ?? []).map((c) => c.name),
          ...(a.answers ?? []).map((c) => c.name),
        ]),
      ]),
      ...VISIT_ENDINGS.map((e) => e.name),
    ]
    for (const word of words) expect(word, word).not.toMatch(MACHINERY)
  })

  it("names each event kind somewhere it can happen", () => {
    const emitted = new Set(
      PIPELINES.flatMap((p) => p.affordances.flatMap((a) => a.emits))
    )
    expect([...emitted].sort()).toEqual([...EVENT_KINDS].sort())
  })

  it.each([
    [
      "an id that is not lowercase words",
      [pipeline([affordance({ id: "Read Aloud" })])],
      "lowercase",
    ],
    [
      "an affordance listed twice on its surface",
      [pipeline([affordance(), affordance()])],
      "twice on its surface",
    ],
    [
      "an offer that emits no offered",
      [pipeline([affordance({ emits: ["taken"] })])],
      "exactly when it has an offer",
    ],
    [
      "a passed-over with nothing offered",
      [
        pipeline([
          affordance({ offer: null, emits: ["taken", "passed-over"] }),
        ]),
      ],
      "only an offer can be passed over",
    ],
    [
      "a left with no places",
      [pipeline([affordance({ emits: ["offered", "taken", "left"] })])],
      "exactly when it names places",
    ],
    [
      "places with no left",
      [pipeline([affordance({ places: [{ id: "here", name: "Here" }] })])],
      "exactly when it names places",
    ],
    [
      "a left of what was never taken",
      [
        pipeline([
          affordance({
            emits: ["offered", "left"],
            places: [{ id: "here", name: "Here" }],
          }),
        ]),
      ],
      "only what was taken can be left",
    ],
    [
      "a said with no answers",
      [pipeline([affordance({ emits: ["offered", "said"] })])],
      "exactly when it names answers",
    ],
    [
      "a pipeline whose every affordance is retired",
      [pipeline([affordance({ retired: true })])],
      "offers nothing",
    ],
  ] as const)("refuses %s", (_, pipelines, message) => {
    expect(findRegistryProblems(pipelines, []).join("\n")).toContain(message)
  })

  it("allows the same id on the other surface, meaning the same thing there", () => {
    expect(
      findRegistryProblems(
        [pipeline([affordance(), affordance({ surface: "web" })])],
        []
      )
    ).toEqual([])
  })

  it("refuses a route both unmeasured and offered on", () => {
    expect(
      findRegistryProblems(
        [pipeline([affordance()])],
        [{ route: "/somewhere", why: "a setting" }]
      ).join("\n")
    ).toContain("unmeasured, yet")
  })
})
