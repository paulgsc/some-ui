/**
 * The .github/ guards (CLAUDE.md "Workflow storage", and RS1/RS2 in
 * "Cross-repo coupling"), as pure functions over a file's text.
 * `scripts/check-workflows.ts` feeds them every workflow and composite action;
 * these cases pin the rules themselves.
 */

import { readFileSync } from "node:fs"
import {
  checkRetentionTriggers,
  checkRs1,
  describeWorkflowViolation,
  findArtifactFamilyViolations,
  findBuildRecordViolations,
  findCacheViolations,
  findRetentionViolations,
  findRs2Violations,
  isGuardedWorkflowPath,
  literalKeyPrefix,
  producerNames,
  RETENTION_FILE,
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

  it("reports a flow-style with: or step as unreadable instead of guessing", () => {
    const text = steps(
      "      - uses: actions/upload-artifact@v7",
      "        with: { path: dist, retention-days: 1 }",
      "      - { uses: actions/upload-artifact@v7, with: { path: dist } }",
      "      # e.g. - { uses: actions/upload-artifact@v7 }",
      "      - run: echo actions/upload-artifact@v7"
    )
    expect(findRetentionViolations(F, text)).toEqual([
      { kind: "retentionUnreadable", file: F, line: 4 },
      { kind: "retentionUnreadable", file: F, line: 6 },
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

describe("findArtifactFamilyViolations", () => {
  it("accepts a declared name kept for its family's TTL", () => {
    const text = steps(
      "      - uses: actions/upload-artifact@v7",
      "        with:",
      "          name: some-ui-apk-${{ github.sha }}",
      "          retention-days: 30"
    )
    expect(findArtifactFamilyViolations(F, text, ["Mobile APK"])).toEqual([])
  })

  it("reads upload-pages-artifact's default name", () => {
    const text = steps(
      "      - uses: actions/upload-pages-artifact@v5",
      "        with:",
      "          retention-days: 1"
    )
    expect(findArtifactFamilyViolations(F, text, ["Pages"])).toEqual([])
  })

  it("reports an undeclared name and a TTL that disagrees with its family", () => {
    const text = steps(
      "      - uses: actions/upload-artifact@v7",
      "        with:",
      "          name: mystery",
      "          retention-days: 1",
      "      - uses: actions/upload-artifact@v7",
      "        with:",
      "          name: some-ui-apk-${{ github.sha }}",
      "          retention-days: 7"
    )
    expect(findArtifactFamilyViolations(F, text, ["Mobile APK"])).toEqual([
      { kind: "artifactUndeclared", file: F, line: 4, name: "mystery" },
      {
        kind: "artifactTtl",
        file: F,
        line: 8,
        name: "some-ui-apk-${{ github.sha }}",
        value: "7",
        ttlDays: 30,
      },
    ])
  })

  it("reports a declared name uploaded by a workflow its family does not list", () => {
    const text = steps(
      "      - uses: actions/upload-artifact@v7",
      "        with:",
      "          name: workspace-dist",
      "          retention-days: 1"
    )
    expect(findArtifactFamilyViolations(F, text, ["Pages"])).toEqual([
      {
        kind: "artifactProducer",
        file: F,
        line: 4,
        name: "workspace-dist",
        workflow: "Pages",
      },
    ])
  })
})

describe("producerNames", () => {
  it("names a workflow by its own name and a reusable one or an action by its callers'", () => {
    const texts = new Map([
      [
        ".github/workflows/a.yml",
        "name: A\non: push\njobs:\n  x:\n    uses: ./.github/workflows/_r.yml",
      ],
      [
        ".github/workflows/b.yml",
        "name: B\non: push\njobs:\n  y:\n    steps:\n      - uses: ./.github/actions/act",
      ],
      [
        ".github/workflows/_r.yml",
        "name: R\non:\n  workflow_call:\njobs:\n  z:\n    steps:\n      - uses: ./.github/actions/act",
      ],
      [
        ".github/actions/act/action.yml",
        "name: Act\nruns:\n  using: composite",
      ],
    ])
    expect(producerNames(texts)).toEqual(
      new Map([
        [".github/workflows/a.yml", ["A"]],
        [".github/workflows/b.yml", ["B"]],
        [".github/workflows/_r.yml", ["A"]],
        [".github/actions/act/action.yml", ["A", "B"]],
      ])
    )
  })

  it("reads triggers from on:, in block or flow form, and names a file by its path without name:", () => {
    const texts = new Map([
      [
        ".github/workflows/both.yml",
        "name: Both\non:\n  workflow_dispatch:\n  workflow_call:\n    inputs:\n      push:\n        type: string",
      ],
      [".github/workflows/flow.yml", "name: Flow\non: [workflow_call]"],
      [
        ".github/workflows/caller.yml",
        "name: Caller\non: push\njobs:\n  a:\n    uses: ./.github/workflows/flow.yml\n  b:\n    uses: ./.github/workflows/both.yml\n  c:\n    steps:\n      - uses: ./.github/actions/act/",
      ],
      [".github/workflows/nameless.yml", "on:\n  push:"],
      [".github/workflows/listed.yml", "name: Listed\non:\n  - push"],
      [".github/actions/act/action.yaml", "runs:\n  using: composite"],
    ])
    const names = producerNames(texts)
    expect(names.get(".github/workflows/both.yml")).toEqual(["Both", "Caller"])
    expect(names.get(".github/workflows/flow.yml")).toEqual(["Caller"])
    expect(names.get(".github/workflows/nameless.yml")).toEqual([
      ".github/workflows/nameless.yml",
    ])
    expect(names.get(".github/actions/act/action.yaml")).toEqual(["Caller"])
    expect(names.get(".github/workflows/listed.yml")).toEqual(["Listed"])
  })
})

describe("findCacheViolations", () => {
  it("accepts a key under a declared prefix, for restore and save too", () => {
    const text = steps(
      "      - uses: actions/cache@v6",
      "        with:",
      "          key: pnpm-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}",
      "      - uses: actions/cache/restore@v6",
      "        with:",
      "          key: cargo-target-${{ runner.os }}-x"
    )
    expect(findCacheViolations(F, text)).toEqual([])
  })

  it("reports a key no family declares", () => {
    const text = steps(
      "      - uses: actions/cache/save@v6",
      "        with:",
      "          key: turbo-${{ github.sha }}"
    )
    expect(findCacheViolations(F, text)).toEqual([
      {
        kind: "cacheUndeclared",
        file: F,
        line: 4,
        key: "turbo-${{ github.sha }}",
      },
    ])
  })
})

describe("literalKeyPrefix", () => {
  it("reads the text before a key's first expression", () => {
    expect(
      literalKeyPrefix("pnpm-${{ runner.os }}-${{ hashFiles('x') }}")
    ).toBe("pnpm-")
    expect(literalKeyPrefix("static")).toBe("static")
  })
})

describe("findBuildRecordViolations", () => {
  it("requires a build-push step to turn off its build record", () => {
    const off = steps(
      "      - uses: docker/build-push-action@v7",
      "        env:",
      "          DOCKER_BUILD_RECORD_UPLOAD: false",
      "        with:",
      "          push: true"
    )
    const on = steps(
      "      - uses: docker/build-push-action@v7",
      "        with:",
      "          push: true"
    )
    const misplaced = steps(
      "      - uses: docker/build-push-action@v7",
      "        with:",
      "          DOCKER_BUILD_RECORD_UPLOAD: false"
    )
    expect(findBuildRecordViolations(F, off)).toEqual([])
    for (const text of [on, misplaced]) {
      expect(findBuildRecordViolations(F, text)).toEqual([
        { kind: "buildRecord", file: F, line: 4 },
      ])
    }
  })
})

describe("checkRetentionTriggers", () => {
  const names = new Set([
    "Mobile APK",
    "Pages",
    "Extension CI",
    "Extension Release",
    "Sign Firefox Extension (Manual)",
    "WASM Release",
  ])

  it("reads only the workflow_run list, and asks for each kept family's workflow", () => {
    const text = [
      "on:",
      "  workflow_run:",
      "    workflows:",
      "      - Mobile APK",
      '      - "Extension Release"',
      "    types: [completed]",
      "  pull_request:",
      "    paths:",
      "      - Sign Firefox Extension (Manual)",
    ].join("\n")
    expect(checkRetentionTriggers(text, names)).toEqual([
      {
        kind: "retentionTrigger",
        file: RETENTION_FILE,
        workflow: "Sign Firefox Extension (Manual)",
      },
    ])
  })

  it("names a family's workflow that no workflow is called", () => {
    const renamed = new Set([...names].filter((n) => n !== "WASM Release"))
    expect(checkRetentionTriggers(null, renamed)).toContainEqual({
      kind: "familyWorkflowUnknown",
      file: RETENTION_FILE,
      workflow: "WASM Release",
    })
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
      [
        { kind: "artifactUndeclared", file: F, line: 2, name: "x" },
        "ARTIFACT_FAMILIES",
      ],
      [
        {
          kind: "artifactTtl",
          file: F,
          line: 2,
          name: "x",
          value: "2",
          ttlDays: 1,
        },
        "says 1",
      ],
      [
        { kind: "cacheUndeclared", file: F, line: 2, key: "k" },
        "CACHE_FAMILIES",
      ],
      [
        { kind: "retentionTrigger", file: RETENTION_FILE, workflow: "W" },
        "workflow_run",
      ],
      [{ kind: "buildRecord", file: F, line: 2 }, "DOCKER_BUILD_RECORD_UPLOAD"],
      [
        {
          kind: "artifactProducer",
          file: F,
          line: 2,
          name: "x",
          workflow: "W",
        },
        "does not list",
      ],
      [
        { kind: "familyWorkflowUnknown", file: RETENTION_FILE, workflow: "W" },
        "no workflow has that",
      ],
    ]
    for (const [violation, expected] of cases) {
      expect(describeWorkflowViolation(violation)).toContain(expected)
    }
  })
})
