import { ungatedInfiniteAnimations } from "@common/testing/animation-gate"
import { beforeEach, describe, expect, it } from "vitest"

const GATE = "#xx-root.xx-dormant"
const CSS = `
  .xx-spin { animation: spin 2s linear infinite; }
  .xx-orbit::after { animation-name: orbit; animation-iteration-count: infinite; }
  .xx-once { animation: pop 300ms both; }
  @keyframes spin { to { transform: rotate(1turn) } }
  @media (prefers-reduced-motion: reduce) { .xx-spin { animation: none } }
`
const GATE_RULE = `${GATE}, ${GATE} * { animation: none; }`

beforeEach(() => {
  document.body.innerHTML = `
    <div id="xx-root" class="xx-dormant">
      <span class="xx-spin"></span><span class="xx-once"></span>
    </div>
    <div class="xx-orbit" id="outside"></div>`
})

describe("ungatedInfiniteAnimations", () => {
  it("counts every infinite animation when the stylesheet has no gate rule", () => {
    expect(ungatedInfiniteAnimations(document, CSS, GATE)).toHaveLength(2)
  })

  it("finds the element animating outside the gated root", () => {
    const found = ungatedInfiniteAnimations(document, CSS + GATE_RULE, GATE)
    expect(found.map((e) => e.id)).toEqual(["outside"])
  })

  it("is empty once nothing animates outside the gate", () => {
    document.getElementById("outside")?.remove()
    expect(ungatedInfiniteAnimations(document, CSS + GATE_RULE, GATE)).toEqual(
      []
    )
  })
})
