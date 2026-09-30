/**
 * The .github/ guards (CLAUDE.md "Workflow storage", and RS1/RS2 in
 * "Cross-repo coupling"), as pure functions over a file's text.
 * `scripts/check-workflows.ts` feeds them every workflow and composite action;
 * these cases pin the rules themselves.
 */

import { readFileSync } from "node:fs"
import {
  checkRs1,
  describeWorkflowViolation,
  findRetentionViolations,
  findRs2Violations,
  isGuardedWorkflowPath,
  RS1_FILE,
  rs1Fingerprint,
  type WorkflowViolation,
} from "@eslint/workflow-guards.js"
import { describe, expect, it } from "vitest"

const F = ".github/workflows/x.yml"

function steps(...body: Array<string>): string {
  return ["jobs:", "  a:", "    steps:", ...body].join("\n")
}

describe("findRetentionViolations", () => {
  it("accepts retention-days: 1, whichever key the step starts with", () => {
    const text = steps(
      "      - name: Upload",
      "        uses: actions/upload-artifact@v7",
      "        with:",
      "          name: a",
      "          retention-days: 1",
      "      - uses: actions/upload-pages-artifact@v5",
      "        with:",
      "          retention-days: '1'",
      "      - uses: actions/upload-artifact@v4",
      "        with: { name: b }",
      "        # note",
      "      - uses: actions/upload-artifact@v4",
      "        with:",
      '          retention-days: "1" # same run only'
    )
    expect(findRetentionViolations(F, text)).toEqual([
      { kind: "retentionUnreadable", file: F, line: 12 },
    ])
  })

  it("reports a step with no retention-days at its item line, tag or not", () => {
    const text = steps(
      "      # Retention: tagged, but the period is still the repo default",
      "      - name: Upload",
      "        uses: actions/upload-artifact@v7",
      "        with:",
      "          name: a",
      "      - name: Next",
      "        run: echo",
      "        with:",
      "          retention-days: 1"
    )
    expect(findRetentionViolations(F, text)).toEqual([
      { kind: "retentionMissing", file: F, line: 5 },
    ])
  })

  it("requires a Retention: line directly above anything but 1", () => {
    const text = steps(
      "      - uses: actions/upload-artifact@v7",
      "        with:",
      "          retention-days: 90",
      "      - uses: actions/upload-artifact@v7",
      "        with:",
      "          retention-days: 0",
      "      - uses: actions/upload-artifact@v7",
      "        with:",
      "          retention-days: ${{ inputs.days }}"
    )
    expect(findRetentionViolations(F, text)).toEqual([
      { kind: "retentionUnstated", file: F, line: 4, value: "90" },
      { kind: "retentionNotDays", file: F, line: 7, value: "0" },
      {
        kind: "retentionNotDays",
        file: F,
        line: 10,
        value: "${{ inputs.days }}",
      },
    ])
  })

  it("does not let a Retention: line excuse a value that is not a number of days", () => {
    const text = steps(
      "      # Retention: tagged.",
      "      - uses: actions/upload-artifact@v7",
      "        with:",
      "          retention-days: 0",
      "      # Retention: tagged.",
      "      - uses: actions/upload-artifact@v7",
      "        with:",
      "          retention-days:",
      "      # Retention: tagged.",
      "      - uses: actions/upload-artifact@v7",
      "        with:",
      "          retention-days: ${{ inputs.days }}",
      "      # Retention: tagged.",
      "      - uses: actions/upload-artifact@v7",
      "        with:",
      "          retention-days: 7d"
    )
    expect(
      findRetentionViolations(F, text).map((v) =>
        v.kind === "retentionNotDays" ? v.value : v.kind
      )
    ).toEqual(["0", "", "${{ inputs.days }}", "7d"])
  })

  it("accepts a Retention: line anywhere in the unbroken block above", () => {
    const text = steps(
      "      # Retention: 30 days, the store's review window.",
      "      # More words.",
      "      - name: Upload",
      "        uses: actions/upload-artifact@v7",
      "        with:",
      "          retention-days: 30"
    )
    expect(findRetentionViolations(F, text)).toEqual([])
  })

  it("does not accept a Retention: line cut off by a blank or code line", () => {
    const text = steps(
      "      # Retention: 30 days.",
      "",
      "      - uses: actions/upload-artifact@v7",
      "        with:",
      "          retention-days: 30",
      "      # Retention: 30 days.",
      "        run: echo",
      "      - uses: actions/upload-artifact@v7",
      "        with:",
      "          retention-days: 30",
      "      # Retention:",
      "      - uses: actions/upload-artifact@v7",
      "        with:",
      "          retention-days: 30"
    )
    expect(
      findRetentionViolations(F, text).map(
        (v) => v.kind === "retentionUnstated" && v.line
      )
    ).toEqual([6, 11, 15])
  })

  it("reads the value only as a direct child of the step's block with: map", () => {
    const text = steps(
      "      - uses: actions/upload-artifact@v7",
      "        env:",
      "          retention-days: 1",
      "      - uses: actions/upload-artifact@v7",
      "        with:",
      "          name: a",
      "        env:",
      "          retention-days: 1",
      "      - uses: actions/upload-artifact@v7",
      "        with:",
      "          nested:",
      "            retention-days: 1",
      "      - uses: actions/upload-artifact@v7",
      "        retention-days: 1",
      "      - with: # inputs first",
      "          retention-days: 1",
      "        uses: actions/upload-artifact@v7"
    )
    expect(findRetentionViolations(F, text)).toEqual([
      { kind: "retentionMissing", file: F, line: 4 },
      { kind: "retentionMissing", file: F, line: 7 },
      { kind: "retentionMissing", file: F, line: 12 },
      { kind: "retentionMissing", file: F, line: 16 },
    ])
  })

  it("reports a flow-style with: as unreadable instead of guessing", () => {
    const text = steps(
      "      - uses: actions/upload-artifact@v7",
      "        with: { path: dist, retention-days: 1 }"
    )
    expect(findRetentionViolations(F, text)).toEqual([
      { kind: "retentionUnreadable", file: F, line: 4 },
    ])
  })

  it("ignores download steps and other actions", () => {
    const text = steps(
      "      - uses: actions/download-artifact@v8",
      "      - uses: someone/upload-artifact@v1",
      "      - run: echo actions/upload-artifact@v7"
    )
    expect(findRetentionViolations(F, text)).toEqual([])
  })
})

describe("rs1Fingerprint", () => {
  const text = [
    "name: X",
    "# header",
    "on: push",
    "jobs:",
    "  a:",
    "    strategy:",
    "      matrix:",
    "        cmd:",
    "          - |",
    "            # data inside a sequence-item block scalar",
    "            echo hi",
    "    steps:",
    "      - run: |+",
    "          echo hi",
    "",
    "      # between steps",
    "      - run: echo",
  ].join("\n")

  // Every edit moves the pin, comment lines included: telling a comment from a
  // `#` line inside a scalar is YAML parsing, and each lexical attempt at it
  // missed one of the shapes below (#1604).
  it("moves on every edit, comments and whitespace included", () => {
    const fingerprint = rs1Fingerprint(text)
    for (const changed of [
      text.replace("# header", "# reworded header"),
      text.replace("      # between steps", "      # reworded"),
      text.replace("# data inside", "# changed data inside"),
      text.replace("echo hi\n\n", "echo hi\n"),
      text.replace("on: push", "on: push "),
      `${text}\n`,
      text.replace("run: echo", "run: gh pr merge"),
    ]) {
      expect(rs1Fingerprint(changed)).not.toBe(fingerprint)
    }
    expect(rs1Fingerprint(text)).toBe(fingerprint)
  })

  it("pins the real file, and fails when it is missing", () => {
    const real = readFileSync(
      new URL(`../../../${RS1_FILE}`, import.meta.url),
      "utf8"
    )
    expect(checkRs1(real)).toEqual([])
    expect(checkRs1(`${real}\n      - run: gh pr merge\n`)).toMatchObject([
      { kind: "rs1Changed", file: RS1_FILE },
    ])
    expect(checkRs1(null)).toEqual([
      { kind: "rs1Changed", file: RS1_FILE, actual: null },
    ])
  })
})

describe("findRs2Violations", () => {
  it("flags the snapshot branch anywhere but the RS1 file", () => {
    const text = "on: push\n# pushes bot/server-route-snapshot\n"
    expect(findRs2Violations(F, text)).toEqual([
      { kind: "rs2Named", file: F, line: 2 },
    ])
    expect(findRs2Violations(RS1_FILE, text)).toEqual([])
  })
})

describe("isGuardedWorkflowPath", () => {
  it("covers workflows and composite actions only", () => {
    expect(isGuardedWorkflowPath(".github/workflows/a.yml")).toBe(true)
    expect(isGuardedWorkflowPath(".github/workflows/a.yaml")).toBe(true)
    expect(isGuardedWorkflowPath(".github/actions/x/action.yml")).toBe(true)
    expect(isGuardedWorkflowPath(".github/actions/x/detect.sh")).toBe(false)
    expect(isGuardedWorkflowPath(".github/workflows/sub/a.yml")).toBe(false)
    expect(isGuardedWorkflowPath(".github/dependabot.yml")).toBe(false)
  })
})

describe("describeWorkflowViolation", () => {
  it("names the file, the line and the fix for each kind", () => {
    const cases: Array<[WorkflowViolation, string]> = [
      [{ kind: "retentionMissing", file: F, line: 3 }, `${F}:3`],
      [
        { kind: "retentionUnstated", file: F, line: 4, value: "90" },
        "Retention:",
      ],
      [{ kind: "retentionUnreadable", file: F, line: 7 }, "block mapping"],
      [
        { kind: "retentionNotDays", file: F, line: 6, value: "0" },
        "not a literal number of days",
      ],
      [{ kind: "rs1Changed", file: RS1_FILE, actual: "abc" }, "abc"],
      [{ kind: "rs1Changed", file: RS1_FILE, actual: null }, "missing"],
      [{ kind: "rs2Named", file: F, line: 5 }, "RS2"],
    ]
    for (const [violation, expected] of cases) {
      expect(describeWorkflowViolation(violation)).toContain(expected)
    }
  })
})
