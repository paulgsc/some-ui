/**
 * The change-kind record (CLAUDE.md, "Two kinds of pull request"), as a pure
 * function over one commit message. `scripts/check-commit-trailers.ts` feeds
 * it the message being written (commit-msg hook) or each commit a PR adds.
 */

import {
  checkCommitTrailers,
  cleanCommitMessage,
  describeTrailerFinding,
  isBotIdentity,
  isExemptSubject,
} from "@eslint/commit-trailers.js"
import { describe, expect, it } from "vitest"

const msg = (...paragraphs: Array<string>): string => paragraphs.join("\n\n")
const coAuthor = "Co-Authored-By: Someone <someone@example.com>"

describe("checkCommitTrailers", () => {
  it("accepts a story whose kind sits with the other trailers", () => {
    expect(
      checkCommitTrailers(
        msg(
          "feat(x): a thing",
          "Why it exists.",
          `Change-Kind: story\n${coAuthor}`
        )
      )
    ).toEqual([])
  })

  it("accepts a defect with its promise and relations", () => {
    expect(
      checkCommitTrailers(
        msg(
          "fix(x): keep the place",
          [
            "Change-Kind: defect",
            "Promise: SS2 apps/www/src/lib/session-stop | stop-resume ordering, host",
            "Relates: SS1 shares stop-resume ordering",
            "Relates: LA8 breaks",
            "Relates: JB1 widens",
            coAuthor,
          ].join("\n")
        )
      )
    ).toEqual([])
  })

  it("accepts every Promise and Relates line on main when this landed", () => {
    const lines = [
      "Promise: JB2 apps/www/src/lib/jobs/journey.ts | road, network, timing, share order",
      "Promise: JB1 apps/www/src/components/jobs apps/www/src/lib/jobs | leave and return, time away",
      "Promise: LA8 apps/www/src/lib/home-link | what starts a home request",
      "Promise: LA12 apps/www/src/lib/home-link packages/ui/topik | look moment, pairing, late answer",
      "Relates: LA8 shares timing",
    ]
    expect(
      checkCommitTrailers(
        msg("fix(x): y", ["Change-Kind: defect", ...lines].join("\n"))
      )
    ).toEqual([])
  })

  it("reports a missing kind, and a subject with no body", () => {
    expect(checkCommitTrailers(msg("feat(x): y", coAuthor))).toEqual([
      { kind: "missingKind" },
    ])
    expect(checkCommitTrailers("feat(x): y")).toEqual([{ kind: "missingKind" }])
  })

  it("names a kind cut off from the final paragraph by a blank line", () => {
    expect(
      checkCommitTrailers(msg("feat(x): y", "Change-Kind: story", coAuthor))
    ).toEqual([{ kind: "kindNotFinal" }])
  })

  it("rejects a value other than story or defect, and a second kind", () => {
    expect(
      checkCommitTrailers(msg("feat(x): y", "Change-Kind: feature"))
    ).toEqual([{ kind: "badKind", value: "feature" }])
    expect(
      checkCommitTrailers(msg("feat(x): y", "Change-Kind: Story"))
    ).toEqual([{ kind: "badKind", value: "Story" }])
    expect(
      checkCommitTrailers(
        msg("feat(x): y", "Change-Kind: story\nChange-Kind: defect")
      )
    ).toEqual([{ kind: "duplicateKind" }])
  })

  it("rejects a Promise or Relates line out of shape", () => {
    expect(
      checkCommitTrailers(
        msg("fix(x): y", "Change-Kind: defect\nPromise: SS2 apps/www/src/lib/x")
      )
    ).toEqual([{ kind: "badPromise", value: "SS2 apps/www/src/lib/x" }])
    expect(
      checkCommitTrailers(
        msg("fix(x): y", "Change-Kind: defect\nPromise: ss2 a/b | timing")
      )
    ).toEqual([{ kind: "badPromise", value: "ss2 a/b | timing" }])
    expect(
      checkCommitTrailers(
        msg("fix(x): y", "Change-Kind: defect\nRelates: SS1 shares")
      )
    ).toEqual([{ kind: "badRelates", value: "SS1 shares" }])
    expect(
      checkCommitTrailers(
        msg("fix(x): y", "Change-Kind: defect\nRelates: SS1 extends timing")
      )
    ).toEqual([{ kind: "badRelates", value: "SS1 extends timing" }])
  })

  it("keeps Promise and Relates in the final paragraph", () => {
    expect(
      checkCommitTrailers(
        msg("fix(x): y", "Promise: SS2 a/b | timing", "Change-Kind: defect")
      )
    ).toEqual([{ kind: "notFinal", key: "Promise" }])
  })

  it("puts Relates with a defect, and allows Promise on a story", () => {
    expect(
      checkCommitTrailers(
        msg("feat(x): y", "Change-Kind: story\nRelates: SS1 breaks")
      )
    ).toEqual([{ kind: "relatesOnStory" }])
    expect(
      checkCommitTrailers(
        msg("feat(x): y", "Change-Kind: story\nPromise: SS2 a/b | timing")
      )
    ).toEqual([])
  })

  it("skips merges, reverts and autosquash commits", () => {
    for (const subject of [
      "Merge branch 'main' into claude/x",
      "Merge pull request #12 from a/b",
      "Merge remote-tracking branch 'origin/main' into x",
      'Revert "feat(x): y"',
      "fixup! feat(x): y",
      "squash! feat(x): y",
      "amend! feat(x): y",
    ]) {
      expect(isExemptSubject(subject)).toBe(true)
      expect(checkCommitTrailers(subject)).toEqual([])
    }
    expect(isExemptSubject("feat(merge): Merge two lists")).toBe(false)
  })
})

describe("cleanCommitMessage", () => {
  it("drops comment lines and the scissors tail", () => {
    expect(
      cleanCommitMessage(
        "feat(x): y\n\nChange-Kind: story\n# Please enter the commit message\n# ------------------------ >8 ------------------------\ndiff --git a/x b/x\n"
      )
    ).toBe("feat(x): y\n\nChange-Kind: story")
  })
})

describe("isBotIdentity", () => {
  it("knows GitHub's app authors and nobody else", () => {
    expect(
      isBotIdentity(
        "github-actions[bot]",
        "41898282+github-actions[bot]@users.noreply.github.com"
      )
    ).toBe(true)
    expect(isBotIdentity("renovate[bot]", "bot@renovateapp.com")).toBe(true)
    expect(isBotIdentity("Claude", "noreply@anthropic.com")).toBe(false)
  })
})

describe("describeTrailerFinding", () => {
  it("says what to write for every finding", () => {
    for (const finding of [
      { kind: "missingKind" },
      { kind: "kindNotFinal" },
      { kind: "duplicateKind" },
      { kind: "badKind", value: "x" },
      { kind: "notFinal", key: "Relates" },
      { kind: "badPromise", value: "x" },
      { kind: "badRelates", value: "x" },
      { kind: "relatesOnStory" },
    ] as const) {
      expect(describeTrailerFinding(finding)).not.toBe("")
    }
  })
})
