import { auditStory, MAX_BRANCHES, MAX_DEPTH, sceneAt } from "@makjang/index"
import { isRecord } from "@makjang/schema"
import { describe, expect, it } from "vitest"

import { rawTree } from "./fixture"

type Raw = Record<string, unknown>

/** The value at a dotted path into a fixture. */
function valueAt(root: Raw, path: string): unknown {
  let value: unknown = root
  for (const key of path.split(".")) {
    value = Array.isArray(value)
      ? value[Number(key)]
      : isRecord(value)
        ? value[key]
        : undefined
  }
  return value
}

/** The object at a dotted path, for changing a fixture in place. */
function get(root: Raw, path: string): Raw {
  const value = valueAt(root, path)
  if (!isRecord(value)) throw new Error(`${path} is not an object`)
  return value
}

/** The array at a dotted path. */
function list(root: Raw, path: string): Array<unknown> {
  const value = valueAt(root, path)
  if (!Array.isArray(value)) throw new Error(`${path} is not an array`)
  return value
}

/** The findings for a fixture changed by `edit`. */
function findingsAfter(edit: (tree: Raw) => void): Array<string> {
  const tree = rawTree()
  edit(tree)
  const audit = auditStory(tree)
  if (audit.ok) throw new Error("expected the tree to be rejected")
  return audit.findings.map(({ path, message }) => `${path}: ${message}`)
}

describe("auditStory accepts a tree within bounds", () => {
  it("returns the typed tree", () => {
    const audit = auditStory(rawTree())
    if (!audit.ok) throw new Error(JSON.stringify(audit.findings))
    expect(audit.lesson.pov).toBe("p1")
    expect(audit.lesson.cast.map(({ id }) => id)).toEqual(["p1", "p2"])
    expect(sceneAt(audit.lesson.root, ["b", "y"])?.beats).toHaveLength(3)
    expect(audit.lesson.root.choice?.check).toBe("check c-root")
  })

  it("keeps only the fields the schema names", () => {
    const tree = rawTree()
    get(tree, "root").extra = "dropped"
    const audit = auditStory(tree)
    if (!audit.ok) throw new Error(JSON.stringify(audit.findings))
    expect("extra" in audit.lesson.root).toBe(false)
  })

  it("lets two choices use the same option ids", () => {
    const tree = rawTree()
    get(tree, "root.choice.options.1.child.choice.options.0").id = "a"
    expect(auditStory(tree).ok).toBe(true)
  })
})

describe("auditStory rejects a malformed tree whole, by path", () => {
  it("rejects what is not a lesson", () => {
    expect(auditStory([])).toEqual({
      ok: false,
      findings: [{ path: "", message: "a lesson must be an object" }],
    })
  })

  it(`rejects a choice at depth ${MAX_DEPTH}`, () => {
    expect(
      findingsAfter((tree) => {
        get(tree, "root.choice.options.1.child.choice.options.0.child").choice =
          {
            id: "c-deep",
            prompt: "p",
            check: "k",
            options: [],
          }
      })
    ).toEqual([
      `root.choice.options.1.child.choice.options.0.child.choice: a scene at depth ${MAX_DEPTH} has no choice: the story resolves there`,
    ])
  })

  it("never walks deeper than the bound, however deep the input", () => {
    const tree = rawTree()
    let scene = get(tree, "root.choice.options.0.child")
    for (let depth = 0; depth < 5000; depth += 1) {
      const child = {
        id: `deep-${depth}`,
        place: "p",
        feeling: "f",
        beats: [{ id: `deep-${depth}-n`, text: "t", gloss: "g" }],
      }
      scene.choice = {
        id: `deep-c-${depth}`,
        prompt: "p",
        check: "k",
        options: [
          { id: "1", child },
          { id: "2", child: { ...child, id: `deep-${depth}-b` } },
        ],
      }
      scene = child
    }
    const audit = auditStory(tree)
    expect(audit.ok).toBe(false)
  })

  it(`rejects a choice with fewer than 2 or more than ${MAX_BRANCHES} options`, () => {
    expect(
      findingsAfter((tree) => {
        const choice = get(tree, "root.choice.options.1.child.choice")
        choice.options = list(choice, "options").slice(0, 1)
      })
    ).toEqual([
      "root.choice.options.1.child.choice.options: has 1 options; a choice has 2 to 4",
    ])
    const five = findingsAfter((tree) => {
      const choice = get(tree, "root.choice")
      choice.options = [
        ...list(choice, "options"),
        {
          id: "d",
          child: {
            id: "s-d",
            place: "p",
            feeling: "f",
            beats: [{ id: "s-d-n", text: "t", gloss: "g" }],
          },
        },
        {
          id: "e",
          child: {
            id: "s-e",
            place: "p",
            feeling: "f",
            beats: [{ id: "s-e-n", text: "t", gloss: "g" }],
          },
        },
      ]
    })
    expect(five).toEqual([
      "root.choice.options: has 5 options; a choice has 2 to 4",
    ])
  })

  it("rejects an id used twice, across scenes, beats and choices", () => {
    expect(
      findingsAfter((tree) => {
        get(tree, "root.choice.options.0.child").id = "s-root-l1"
        get(tree, "root.choice.options.1.child.choice").id = "c-root"
      })
    ).toEqual([
      'root.choice.options.0.child.id: "s-root-l1" is already the id of another scene, beat or choice',
      'root.choice.options.1.child.choice.id: "c-root" is already the id of another scene, beat or choice',
    ])
  })

  it("rejects an option id used twice in one choice", () => {
    expect(
      findingsAfter((tree) => {
        get(tree, "root.choice.options.2").id = "a"
      })
    ).toEqual([
      'root.choice.options.2.id: "a" is already an option of this choice',
    ])
  })

  it("rejects a speaker, pov or register key outside the cast", () => {
    expect(
      findingsAfter((tree) => {
        tree.pov = "p9"
        get(tree, "root.beats.1").speaker = "p8"
        get(tree, "cast.0.registers").p7 = "polite"
        get(tree, "cast.1.registers").p2 = "to self"
      })
    ).toEqual([
      'cast.0.registers.p7: "p7" is not in the cast',
      "cast.1.registers.p2: a register is toward another",
      'pov: "p9" is not in the cast',
      'root.beats.1.speaker: "p8" is not in the cast',
    ])
  })

  it("rejects a cast member listed twice", () => {
    expect(
      findingsAfter((tree) => {
        get(tree, "cast.1").id = "p1"
      })
    ).toContain('cast.1.id: "p1" is already in the cast')
  })

  it("rejects an option that leads nowhere, a scene with no beats, and a scene with no feeling", () => {
    expect(
      findingsAfter((tree) => {
        delete get(tree, "root.choice.options.0").child
        get(tree, "root.choice.options.2.child").beats = []
        get(tree, "root.choice.options.1.child").feeling = "  "
        delete get(tree, "root.choice.options.1.child.choice.options.1.child")
          .feeling
      })
    ).toEqual([
      "root.choice.options.0.child: is missing: every option leads to a scene",
      "root.choice.options.1.child.feeling: must be a non-blank string",
      "root.choice.options.1.child.choice.options.1.child.feeling: is missing",
      "root.choice.options.2.child.beats: is empty: a scene has at least one beat",
    ])
  })

  it("rejects a choice that carries no check", () => {
    expect(
      findingsAfter((tree) => {
        delete get(tree, "root.choice").check
      })
    ).toEqual(["root.choice.check: is missing"])
  })

  it("rejects a beat with no text or gloss", () => {
    expect(
      findingsAfter((tree) => {
        get(tree, "root.beats.0").gloss = ""
        delete get(tree, "root.beats.2").text
      })
    ).toEqual([
      "root.beats.0.gloss: must be a non-blank string",
      "root.beats.2.text: is missing",
    ])
  })
})
