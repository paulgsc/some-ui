import type { SolvedNode } from "@wireframes/lib/layout-types"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { RenderSolved } from "."

const rect = { x: 0, y: 0, width: 100, height: 100 }

const panes = (node: SolvedNode<string>): Array<Element> => {
  const host = document.createElement("div")
  host.innerHTML = renderToStaticMarkup(
    <RenderSolved node={node} renderLeaf={(id) => id} />
  )
  return [...host.querySelectorAll("[data-pane-id]")]
}

describe("RenderSolved pane borders", () => {
  it("draws no frame around a lone pane - there is nothing to separate it from", () => {
    const [pane] = panes({ type: "leaf", id: "V", rect })
    expect(pane?.className).not.toMatch(/\bborder\b/)
  })

  it("separates split panes with the theme's border token, never a literal colour", () => {
    const split = panes({
      type: "split",
      axis: "row",
      splitId: "s",
      rect,
      children: [
        { type: "leaf", id: "L", rect },
        { type: "leaf", id: "R", rect },
      ],
    })
    expect(split).toHaveLength(2)
    for (const pane of split) {
      expect(pane.className).toMatch(/\bborder-border\b/)
      expect(pane.className).not.toMatch(/pink/)
    }
  })
})
