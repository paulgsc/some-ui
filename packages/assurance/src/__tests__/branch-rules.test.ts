import { readBranchRules } from "@assurance/branch-rules"
import { describe, expect, it } from "vitest"

const required = (
  ...contexts: ReadonlyArray<string>
): { type: string; parameters: unknown } => ({
  type: "required_status_checks",
  parameters: {
    strict_required_status_checks_policy: true,
    required_status_checks: contexts.map((context) => ({
      context,
      integration_id: 15368,
    })),
  },
})

// The active rules returned for paulgsc/some-ui with strict checks enabled.
const someUi = [
  { type: "deletion" },
  { type: "non_fast_forward" },
  { type: "pull_request", parameters: { required_approving_review_count: 0 } },
  required("CI Gate"),
]

describe("GC1: the branch rules require the checks", () => {
  it("holds when every check is required", () => {
    expect(readBranchRules("paulgsc/some-ui", ["CI Gate"], someUi)).toEqual({
      verdict: "holds",
    })
  })

  it("names each check main no longer requires", () => {
    expect(
      readBranchRules(
        "paulgsc/server",
        ["Rust lint", "rust_ci"],
        [required("Rust lint")]
      )
    ).toEqual({
      verdict: "broken",
      problems: ['paulgsc/server: main no longer requires "rust_ci"'],
    })
  })

  it("is broken when the rules require no checks at all, as when the ruleset is off", () => {
    expect(readBranchRules("paulgsc/some-ui", ["CI Gate"], [])).toEqual({
      verdict: "broken",
      problems: [
        'paulgsc/some-ui: main no longer requires "CI Gate"',
        "paulgsc/some-ui: main requires neither up-to-date branches nor a merge queue",
      ],
    })
  })

  it("counts checks required by more than one ruleset", () => {
    expect(
      readBranchRules(
        "paulgsc/server",
        ["a", "b"],
        [required("a"), required("b")]
      )
    ).toEqual({ verdict: "holds" })
  })

  it("requires up-to-date branches or a merge queue", () => {
    for (const strict of [false, undefined, "true"]) {
      const rule = {
        type: "required_status_checks",
        parameters: {
          strict_required_status_checks_policy: strict,
          required_status_checks: [{ context: "CI Gate" }],
        },
      }
      expect(readBranchRules("paulgsc/some-ui", ["CI Gate"], [rule])).toEqual({
        verdict: "broken",
        problems: [
          "paulgsc/some-ui: main requires neither up-to-date branches nor a merge queue",
        ],
      })
      expect(
        readBranchRules(
          "paulgsc/some-ui",
          ["CI Gate"],
          [rule, { type: "merge_queue", parameters: {} }]
        )
      ).toEqual({ verdict: "holds" })
    }
  })

  it("still requires the checks with a merge queue", () => {
    expect(
      readBranchRules("paulgsc/some-ui", ["CI Gate"], [{ type: "merge_queue" }])
    ).toEqual({
      verdict: "broken",
      problems: ['paulgsc/some-ui: main no longer requires "CI Gate"'],
    })
  })

  it("is unknown, never holds, on an answer that is not a list of rules", () => {
    for (const body of [
      { message: "Not Found" },
      null,
      [null],
      [{ type: "required_status_checks", parameters: {} }],
    ])
      expect(
        readBranchRules("paulgsc/some-ui", ["CI Gate"], body).verdict
      ).toBe("unknown")
  })
})
