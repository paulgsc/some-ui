/**
 * The genres (EPISODES2, #3067; C1026): each draws with no text and no
 * filter, in its own hue, and none takes a status colour (C410).
 */
import { describe, expect, it } from "vitest"

import type { CastNode } from "../cast"
import { nodesText } from "../cast"
import { GENRE_PAINT, genreArt, genreNodes, GENRES } from "../genres"

const walk = (nodes: ReadonlyArray<CastNode>): Array<CastNode> =>
  nodes.flatMap((node) => [node, ...walk(node.children ?? [])])

describe("the genres", () => {
  it.each(GENRES)("%s draws without text or a filter", (genre) => {
    const nodes = walk(genreArt(genre))
    expect(nodes.some((n) => n.tag === "text" || n.tag === "filter")).toBe(
      false
    )
    expect(nodes.some((n) => "font-family" in n.attrs)).toBe(false)
  })

  it.each(GENRES)("%s's shape is drawn in its own hue", (genre) => {
    const text = nodesText(genreNodes(genre), { ground: "none" })
    expect(text).toContain(GENRE_PAINT[genre].hue)
  })

  it("gives every genre its own hue and ground", () => {
    const hues = GENRES.map((g) => GENRE_PAINT[g].hue)
    const grounds = GENRES.map((g) => GENRE_PAINT[g].ground)
    expect(new Set(hues).size).toBe(GENRES.length)
    expect(new Set(grounds).size).toBe(GENRES.length)
  })
})

describe("nodesText", () => {
  const ground: CastNode = {
    tag: "rect",
    attrs: { width: 96, height: 96, "data-ground": "true" },
  }
  const glow: CastNode = {
    tag: "rect",
    attrs: { width: 96, height: 96, fill: "url(#g)", "data-glow": "true" },
  }

  it("paints the ground, and keeps no data attribute", () => {
    expect(nodesText([ground], { ground: "#123456" })).toBe(
      '<rect width="96" height="96" fill="#123456"></rect>'
    )
  })

  it("leaves the key light out when asked, at any depth", () => {
    const tree: CastNode = { tag: "g", attrs: {}, children: [glow] }
    expect(nodesText([glow, tree], { ground: "none", glow: false })).toBe(
      "<g></g>"
    )
    expect(nodesText([glow], { ground: "none" })).toContain('fill="url(#g)"')
  })

  it("escapes what an attribute holds", () => {
    expect(
      nodesText([{ tag: "path", attrs: { d: 'a"<&' } }], { ground: "none" })
    ).toBe('<path d="a&quot;&lt;&amp;"></path>')
  })
})
