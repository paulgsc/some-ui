import { CutListSchema, ShotSchema } from "@video-render/cut-list"
import { STEPS, type Io } from "@video-render/steps"
import { describe, expect, it } from "vitest"

/** Whether a field names one the cut list has: a top-level key, or `shots.<key>`. */
const isField = (field: string): boolean => {
  const [top, inner] = field.split(".")
  if (top === undefined || !(top in CutListSchema.shape)) return false
  if (inner === undefined) return true
  return top === "shots" && inner in ShotSchema.shape
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

  it("keeps work on a session that isn't Claude's only with a blocker named", () => {
    expect(
      STEPS.filter(
        (s) => s.now === "session" && s.kind !== "claude" && !s.blockedBy
      ).map((s) => s.id)
    ).toEqual([])
  })

  it("leaves what only the owner does with the owner", () => {
    for (const s of STEPS.filter((x) => x.kind === "owner")) {
      expect([s.id, s.now, s.target]).toEqual([s.id, "owner", "owner"])
    }
  })

  it("moves a step through cut-list fields and files only", () => {
    const unknown = STEPS.flatMap((s) =>
      [...fieldsOf(s.reads), ...fieldsOf(s.writes)]
        .filter((f) => !isField(f))
        .map((f) => `${s.id}: ${f}`)
    )
    expect(unknown).toEqual([])
  })
})
