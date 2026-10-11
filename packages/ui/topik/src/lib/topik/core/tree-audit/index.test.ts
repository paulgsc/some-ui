import type { Lesson } from "@some-ui/makjang"
import { auditStory, sceneAt } from "@some-ui/makjang"
import { auditTeaching } from "@topik/lib/topik/core/tree-audit"
import { describe, expect, it } from "vitest"

/*
 * A synthetic tree, not a curated scene: a root whose choice splits three
 * ways, one child with a choice of its own, leaves elsewhere. The Korean is
 * the minimum each probe rule needs to pass.
 */

type Raw = Record<string, unknown>

const pickValid = (overrides: Raw = {}): Raw => ({
  id: "p-root",
  kind: "pick-valid",
  order: 3,
  source: "가요?",
  prompt: "Which reply fits?",
  options: [
    { id: "a", text: "네, 가요.", relation: "reply", valid: true, why: "w a" },
    { id: "b", text: "가세요.", relation: "reply", valid: false, why: "w b" },
    { id: "c", text: "안녕.", relation: "reply", valid: false, why: "w c" },
  ],
  ...overrides,
})

const oddOneOut = (overrides: Raw = {}): Raw => ({
  id: "p-b",
  kind: "odd-one-out",
  order: 2,
  source: "카드로 할게요.",
  prompt: "Which is NOT a valid transformation?",
  options: [
    {
      id: "x",
      text: "카드로 했어요.",
      relation: "past",
      valid: true,
      why: "w",
    },
    {
      id: "y",
      text: "카드로 안 할게요.",
      relation: "negation",
      valid: true,
      why: "w",
    },
    {
      id: "z",
      text: "카드로 하지 마세요.",
      relation: "negation",
      valid: false,
      why: "w",
    },
  ],
  ...overrides,
})

const leaf = (id: string, feeling = "warmth"): Raw => ({
  id,
  place: "place",
  feeling,
  beats: [{ id: `${id}-n1`, text: "text", gloss: "gloss" }],
})

function rawTree(edit: (tree: { root: Raw; b: Raw }) => void = () => {}): Raw {
  const b: Raw = {
    ...leaf("s-b", "chill"),
    choice: {
      id: "c-b",
      prompt: "prompt",
      check: oddOneOut(),
      options: [
        { id: "x", child: leaf("s-bx") },
        { id: "y", child: leaf("s-by") },
        { id: "z", child: leaf("s-bz", "fury") },
      ],
    },
  }
  const root: Raw = {
    ...leaf("s-root", "tension"),
    choice: {
      id: "c-root",
      prompt: "prompt",
      check: pickValid(),
      options: [
        { id: "a", child: leaf("s-a") },
        { id: "b", child: b },
        { id: "c", child: leaf("s-c", "cringe") },
      ],
    },
  }
  edit({ root, b })
  return {
    id: "lesson",
    level: 2,
    pov: "p1",
    cast: [{ id: "p1", name: "One", standing: "s", registers: {} }],
    root,
  }
}

function lesson(raw: Raw): Lesson<unknown> {
  const story = auditStory(raw)
  if (!story.ok) throw new Error(JSON.stringify(story.findings))
  return story.lesson
}

const choiceOf = (scene: Raw): Raw => {
  const choice = scene.choice
  if (typeof choice !== "object" || choice === null || Array.isArray(choice)) {
    throw new Error("no choice")
  }
  return Object.fromEntries(Object.entries(choice))
}

/** Replaces a scene's check. */
const withCheck = (scene: Raw, check: Raw): void => {
  scene.choice = { ...choiceOf(scene), check }
}

describe("auditTeaching", () => {
  it("passes a clean tree as written", () => {
    const audit = auditTeaching(lesson(rawTree()))
    if (!audit.ok) throw new Error(JSON.stringify(audit.findings))
    expect(audit.findings).toEqual([])
    expect(sceneAt(audit.lesson.root, ["b"])?.choice?.check.kind).toBe(
      "odd-one-out"
    )
  })

  it("rejects a scene whose feeling the renderer does not have", () => {
    const audit = auditTeaching(
      lesson(
        rawTree(({ b }) => {
          b.feeling = "melancholy"
        })
      )
    )
    expect(audit.ok).toBe(false)
    expect(audit.findings).toEqual([
      expect.objectContaining({
        audit: "teaching",
        severity: "error",
        path: "root.choice.options.1.child.feeling",
      }),
    ])
  })

  it("warns about a figure the renderer does not draw, and still plays the tree", () => {
    const raw = rawTree()
    raw.cast = [
      { id: "p1", name: "One", standing: "s", registers: {}, figure: "dragon" },
    ]
    const audit = auditTeaching(lesson(raw))
    if (!audit.ok) throw new Error("expected a playable tree")
    expect(audit.findings).toEqual([
      expect.objectContaining({
        audit: "teaching",
        severity: "warning",
        path: "cast.0.figure",
      }),
    ])
  })

  it("rejects a level outside TOPIK's", () => {
    const audit = auditTeaching(lesson({ ...rawTree(), level: 7 }))
    expect(audit.ok).toBe(false)
    expect(audit.findings.map(({ path }) => path)).toEqual(["level"])
  })

  it("prunes a choice whose check is a build to a leaf, dropping its subtree", () => {
    const audit = auditTeaching(
      lesson(
        rawTree(({ b }) => {
          withCheck(b, {
            id: "p-b",
            kind: "build",
            order: 2,
            relation: "past",
            prompt: "Say it in the past",
            target: "카드로 했어요",
          })
        })
      )
    )
    if (!audit.ok) throw new Error("expected a playable tree")
    const b = sceneAt(audit.lesson.root, ["b"])
    expect(b?.choice).toBeUndefined()
    expect(b?.beats).toHaveLength(1)
    expect(
      audit.findings.map(({ path, severity }) => [path, severity])
    ).toEqual([
      ["root.choice.options.1.child.choice.check", "error"],
      ["root.choice.options.1.child.choice", "error"],
    ])
  })

  it.each([
    [
      "a candidate with no id",
      pickValid({
        options: [
          { text: "네, 가요.", relation: "reply", valid: true, why: "w" },
          {
            id: "b",
            text: "가세요.",
            relation: "reply",
            valid: false,
            why: "w",
          },
          { id: "c", text: "안녕.", relation: "reply", valid: false, why: "w" },
        ],
      }),
      'candidate 0 ("네, 가요.") has no id',
    ],
    [
      "candidate ids that are not the options'",
      pickValid({
        options: [
          {
            id: "a",
            text: "네, 가요.",
            relation: "reply",
            valid: true,
            why: "w",
          },
          {
            id: "b",
            text: "가세요.",
            relation: "reply",
            valid: false,
            why: "w",
          },
          { id: "q", text: "안녕.", relation: "reply", valid: false, why: "w" },
        ],
      }),
      'option "c" names no candidate of the check',
    ],
    [
      "a gloss candidate",
      pickValid({
        options: [
          {
            id: "a",
            text: "네, 가요.",
            relation: "reply",
            valid: true,
            why: "w",
          },
          {
            id: "b",
            text: "Go.",
            relation: "gloss",
            lang: "en",
            valid: false,
            why: "w",
          },
          { id: "c", text: "안녕.", relation: "reply", valid: false, why: "w" },
        ],
      }),
      'candidate "Go." is a gloss',
    ],
    [
      "a candidate with a blank why",
      pickValid({
        options: [
          {
            id: "a",
            text: "네, 가요.",
            relation: "reply",
            valid: true,
            why: " ",
          },
          {
            id: "b",
            text: "가세요.",
            relation: "reply",
            valid: false,
            why: "w",
          },
          { id: "c", text: "안녕.", relation: "reply", valid: false, why: "w" },
        ],
      }),
      "has no `why`",
    ],
    [
      "a candidate repeated",
      pickValid({
        options: [
          {
            id: "a",
            text: "네, 가요.",
            relation: "reply",
            valid: true,
            why: "w",
          },
          {
            id: "b",
            text: "네, 가요.",
            relation: "reply",
            valid: false,
            why: "w",
          },
          { id: "c", text: "안녕.", relation: "reply", valid: false, why: "w" },
        ],
      }),
      'candidate "네, 가요." appears twice',
    ],
    [
      "a check that does not load",
      pickValid({ kind: "pick-any" }),
      "the check does not load",
    ],
  ])("prunes the root's choice for %s", (_name, check, message) => {
    const audit = auditTeaching(
      lesson(
        rawTree(({ root }) => {
          withCheck(root, check)
        })
      )
    )
    if (!audit.ok) throw new Error("expected a playable tree")
    expect(audit.lesson.root.choice).toBeUndefined()
    expect(audit.findings).toContainEqual(
      expect.objectContaining({
        path: "root.choice.check",
        severity: "error",
        message: expect.stringContaining(message),
      })
    )
    expect(audit.findings).toContainEqual(
      expect.objectContaining({
        path: "root",
        severity: "warning",
        message: "no choice is asked: the lesson plays as one scene",
      })
    )
  })

  it("prunes an odd-one-out with no source: there is no anchor line", () => {
    const audit = auditTeaching(
      lesson(
        rawTree(({ b }) => {
          const { source: _source, ...unsourced } = oddOneOut()
          withCheck(b, unsourced)
        })
      )
    )
    if (!audit.ok) throw new Error("expected a playable tree")
    expect(sceneAt(audit.lesson.root, ["b"])?.choice).toBeUndefined()
    expect(audit.findings[0]?.message).toContain("names its `source`")
  })

  it("prunes an odd-one-out whose source is blank", () => {
    const audit = auditTeaching(
      lesson(
        rawTree(({ b }) => {
          withCheck(b, oddOneOut({ source: "  " }))
        })
      )
    )
    if (!audit.ok) throw new Error("expected a playable tree")
    expect(sceneAt(audit.lesson.root, ["b"])?.choice).toBeUndefined()
  })

  it("prunes the later of two choices whose checks share an id", () => {
    const audit = auditTeaching(
      lesson(
        rawTree(({ b }) => {
          withCheck(b, oddOneOut({ id: "p-root" }))
        })
      )
    )
    if (!audit.ok) throw new Error("expected a playable tree")
    expect(audit.lesson.root.choice).toBeDefined()
    expect(sceneAt(audit.lesson.root, ["b"])?.choice).toBeUndefined()
    expect(audit.findings[0]).toMatchObject({
      path: "root.choice.options.1.child.choice.check",
      message: 'check id "p-root" is already another choice\'s',
    })
  })

  it("warns that an anchorMessageId is ignored, and still asks the choice", () => {
    const audit = auditTeaching(
      lesson(
        rawTree(({ root }) => {
          withCheck(root, pickValid({ anchorMessageId: "s-root-n1" }))
        })
      )
    )
    if (!audit.ok) throw new Error("expected a playable tree")
    expect(audit.lesson.root.choice).toBeDefined()
    expect(audit.findings).toEqual([
      expect.objectContaining({
        path: "root.choice.check",
        severity: "warning",
      }),
    ])
  })

  it("warns about an odd-one-out candidate that rewrites its source, and still asks it", () => {
    const check = oddOneOut()
    const options = Array.isArray(check.options) ? [...check.options] : []
    options[0] = {
      id: "x",
      text: "현금으로 드렸습니다.",
      relation: "past",
      valid: true,
      why: "w",
    }
    const audit = auditTeaching(
      lesson(
        rawTree(({ b }) => {
          withCheck(b, { ...check, options })
        })
      )
    )
    if (!audit.ok) throw new Error("expected a playable tree")
    expect(sceneAt(audit.lesson.root, ["b"])?.choice).toBeDefined()
    expect(audit.findings).toEqual([
      expect.objectContaining({
        severity: "warning",
        message: expect.stringContaining("rewrites more than"),
      }),
    ])
  })

  it("still reports what is wrong under a pruned choice", () => {
    const audit = auditTeaching(
      lesson(
        rawTree(({ root, b }) => {
          withCheck(root, pickValid({ kind: "build" }))
          withCheck(b, oddOneOut({ source: undefined }))
        })
      )
    )
    if (!audit.ok) throw new Error("expected a playable tree")
    expect(audit.findings.map(({ path }) => path)).toContain(
      "root.choice.options.1.child.choice.check"
    )
  })
})
