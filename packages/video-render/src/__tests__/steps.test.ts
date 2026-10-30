import { CutListSchema, ShotSchema } from "@video-render/cut-list"
import { STEPS, type Io } from "@video-render/steps"
import { describe, expect, it } from "vitest"

/** Whether a field names one the cut list has: a top-level key, or `shots.<key>`. */
const isField = (field: string): boolean => {
  const [top, inner, ...rest] = field.split(".")
  if (top === undefined || rest.length > 0) return false
  if (!Object.hasOwn(CutListSchema.shape, top)) return false
  if (inner === undefined) return true
  return top === "shots" && Object.hasOwn(ShotSchema.shape, inner)
}

const fieldsOf = (ios: ReadonlyArray<Io>): ReadonlyArray<string> =>
  ios.flatMap((io) => ("field" in io ? [io.field] : []))

describe("who owns each step", () => {
  it("names each step once", () => {
    const ids = STEPS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("never puts a language model on home, now or later", () => {
    expect(
      STEPS.filter(
        (s) => s.kind === "claude" && (s.now === "home" || s.target === "home")
      ).map((s) => s.id)
    ).toEqual([])
  })

  it("names a blocker exactly while a session keeps work that isn't Claude's", () => {
    for (const s of STEPS) {
      const kept = s.now === "session" && s.kind !== "claude"
      expect([s.id, s.blockedBy !== undefined]).toEqual([s.id, kept])
    }
  })

  it("gives the owner their own steps and no others", () => {
    for (const s of STEPS) {
      const theirs = s.kind === "owner"
      expect([s.id, s.now === "owner", s.target === "owner"]).toEqual([
        s.id,
        theirs,
        theirs,
      ])
    }
  })

  it("names only fields the cut list has", () => {
    const unknown = STEPS.flatMap((s) =>
      [...fieldsOf(s.reads), ...fieldsOf(s.writes)]
        .filter((f) => !isField(f))
        .map((f) => `${s.id}: ${f}`)
    )
    expect(unknown).toEqual([])
    expect(isField("constructor")).toBe(false)
    expect(isField("shots.take.inMs")).toBe(false)
  })
})
