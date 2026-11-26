/**
 * The cast (PDA6, #2883): each character names every gradient and clip it
 * uses through `id`, defines each once, and draws with no SVG filter.
 */
import { describe, expect, it } from "vitest"

import { castNodes, CHARACTERS } from "../cast"
import type { CastNode } from "../cast"

const walk = (nodes: ReadonlyArray<CastNode>): Array<CastNode> =>
  nodes.flatMap((node) => [node, ...walk(node.children ?? [])])

describe("the cast", () => {
  it.each(CHARACTERS)(
    "%s defines every id it uses, once, and only through id",
    (who) => {
      const id = (name: string): string => `t-${name}`
      const nodes = walk(castNodes(who, id))
      const defined = nodes.flatMap((n) =>
        typeof n.attrs.id === "string" ? [n.attrs.id] : []
      )
      expect(new Set(defined).size).toBe(defined.length)
      expect(defined.every((d) => d.startsWith("t-"))).toBe(true)
      const used = nodes.flatMap((n) =>
        Object.values(n.attrs).flatMap((v) =>
          typeof v === "string"
            ? [...v.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1])
            : []
        )
      )
      expect(used.length).toBeGreaterThan(0)
      for (const ref of used) expect(defined).toContain(ref)
    }
  )

  it.each(CHARACTERS)(
    "%s draws with gradients alone, no filter, on the host's ground",
    (who) => {
      const nodes = walk(castNodes(who, (name) => name))
      expect(nodes.some((n) => n.tag === "filter" || "filter" in n.attrs)).toBe(
        false
      )
      expect(
        nodes.filter((n) => n.attrs["data-ground"] === "true")
      ).toHaveLength(1)
    }
  )

  it("names the mochi's moving parts for a host to animate, and nothing else", () => {
    const parts = walk(castNodes("mochi", (name) => name)).flatMap((n) =>
      typeof n.attrs["data-part"] === "string" ? [n.attrs["data-part"]] : []
    )
    expect(parts).toEqual([
      "shadow",
      "figure",
      "antenna-left",
      "antenna-right",
      "arm-left",
      "arm-right",
      "face",
      "cheeks",
      "eyes",
      "eyes-happy",
      "brow-left",
      "brow-right",
      "mouth",
      "football",
      "question",
      "bang",
      "bulb",
      "swirl",
      "dot-1",
      "dot-2",
      "dot-3",
      "sweat",
      "vein",
      "puff",
      "spark-1",
      "spark-2",
      "spark-3",
    ])
  })

  it("names the tin owlet's moving parts, tucked in the still drawing", () => {
    const parts = walk(castNodes("tin-owlet", (name) => name)).flatMap((n) =>
      typeof n.attrs["data-part"] === "string" ? [n.attrs["data-part"]] : []
    )
    expect(parts).toEqual([
      "figure",
      "wing-left",
      "wing-right",
      "key",
      "tuft-left",
      "tuft-right",
      "eyes",
      "lid-left",
      "low-lid-left",
      "lid-right",
      "low-lid-right",
      "mouth",
      "beak-low",
    ])
  })

  it("draws the tin owlet's moving parts tucked: wings folded, lids, mouth and lower beak unmoved", () => {
    const moves = walk(castNodes("tin-owlet", (name) => name)).flatMap((n) =>
      typeof n.attrs["data-part"] === "string"
        ? [[n.attrs["data-part"], n.attrs.transform ?? null]]
        : []
    )
    expect(Object.fromEntries(moves)).toEqual({
      figure: null,
      "wing-left": "rotate(0)",
      "wing-right": "rotate(180)",
      key: null,
      "tuft-left": null,
      "tuft-right": null,
      eyes: null,
      "lid-left": null,
      "low-lid-left": null,
      "lid-right": null,
      "low-lid-right": null,
      mouth: null,
      "beak-low": null,
    })
  })

  it("draws the still mochi as it was: its loops' parts are clear until a loop shows them", () => {
    // The shapes a still mochi shows, each with the opacity it shows at,
    // groups that only name a part looked through.
    const visible = (
      nodes: ReadonlyArray<CastNode>,
      opacity = 1
    ): ReadonlyArray<unknown> =>
      nodes.flatMap((node) => {
        const { opacity: own, "data-part": _part, ...rest } = node.attrs
        const shown = opacity * (own === undefined ? 1 : Number(own))
        if (shown === 0) return []
        if (node.tag === "g" && Object.keys(rest).length === 0)
          return visible(node.children ?? [], shown)
        return [
          {
            tag: node.tag,
            ...rest,
            ...(shown === 1 ? {} : { opacity: shown }),
            children: visible(node.children ?? []),
          },
        ]
      })
    // Pinned to the drawing before the mochi's loops (HOST4) gave it parts.
    expect(visible(castNodes("mochi", (name) => name))).toMatchSnapshot()
  })
})
