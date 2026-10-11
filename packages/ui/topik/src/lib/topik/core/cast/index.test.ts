import { FIGURE_KEYS, figuresOf } from "@topik/lib/topik/core/cast"
import { describe, expect, it } from "vitest"

const figuresIn = (
  cast: ReadonlyArray<{ id: string; figure?: string }>
): Array<string | undefined> => {
  const figures = figuresOf(cast)
  return cast.map(({ id }) => figures.get(id))
}

describe("figuresOf", () => {
  it("keeps the figure a tree names", () => {
    expect(
      figuresIn([
        { id: "a", figure: "elder" },
        { id: "b", figure: "rival" },
      ])
    ).toEqual(["elder", "rival"])
  })

  it("draws a cast that names none apart, in the vocabulary's order", () => {
    expect(figuresIn([{ id: "a" }, { id: "b" }, { id: "c" }])).toEqual(
      FIGURE_KEYS.slice(0, 3)
    )
  })

  it("gives the unnamed only what the named leave, and drops a name it has no drawing for", () => {
    expect(
      figuresIn([
        { id: "a" },
        { id: "b", figure: "heart" },
        { id: "c", figure: "dragon" },
      ])
    ).toEqual(["heir", "heart", "elder"])
  })

  it("starts the vocabulary again once a large cast has used it all", () => {
    const cast = Array.from({ length: FIGURE_KEYS.length + 2 }, (_, i) => ({
      id: `c${i}`,
    }))
    expect(figuresIn(cast)).toEqual([
      ...FIGURE_KEYS,
      ...FIGURE_KEYS.slice(0, 2),
    ])
  })

  it("lets two characters a tree names alike keep it", () => {
    expect(
      figuresIn([
        { id: "a", figure: "aide" },
        { id: "b", figure: "aide" },
      ])
    ).toEqual(["aide", "aide"])
  })
})
