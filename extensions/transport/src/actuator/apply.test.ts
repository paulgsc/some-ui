import { describe, expect, it } from "vitest"

import type { Action } from "../contracts/action"
import { apply, type ActionRealizer } from "./apply"
import { isSelfTagged, selfTagValue } from "./self-tag"

type MaskAction = Action & { readonly kind: "mask"; readonly key: string }

function maskRealizer(root: Element): ActionRealizer<MaskAction> {
  return (action) => {
    const el = root.querySelector<HTMLElement>(`[data-key="${action.key}"]`)
    if (el === null) {
      return []
    }
    el.setAttribute("data-masked", "true") // idempotent: same value every call
    return [el]
  }
}

describe("actuator/apply — α(Δ)", () => {
  it("applies each action and self-tags every element it touches", () => {
    const root = document.createElement("div")
    root.innerHTML = `<div data-key="k1"></div>`
    document.body.appendChild(root)

    apply<MaskAction>([{ kind: "mask", key: "k1" }], {
      realize: maskRealizer(root),
      tagValue: (action) => action.key,
    })

    const el = root.querySelector("[data-key='k1']")
    expect(el?.getAttribute("data-masked")).toBe("true")
    expect(el !== null && isSelfTagged(el)).toBe(true)
    expect(el !== null ? selfTagValue(el) : undefined).toBe("k1")

    root.remove()
  })

  it("is idempotent: applying the same action twice produces identical G_t as applying it once", () => {
    const root = document.createElement("div")
    root.innerHTML = `<div data-key="k1"></div>`
    document.body.appendChild(root)

    const options = {
      realize: maskRealizer(root),
      tagValue: (a: MaskAction): string => a.key,
    }

    apply<MaskAction>([{ kind: "mask", key: "k1" }], options)
    const afterFirst = root.innerHTML

    apply<MaskAction>([{ kind: "mask", key: "k1" }], options)
    const afterSecond = root.innerHTML

    expect(afterSecond).toBe(afterFirst)

    root.remove()
  })

  it("an empty Δ applies nothing", () => {
    const root = document.createElement("div")
    root.innerHTML = `<div data-key="k1"></div>`
    document.body.appendChild(root)
    const before = root.innerHTML

    apply<MaskAction>([], {
      realize: maskRealizer(root),
      tagValue: (a) => a.key,
    })

    expect(root.innerHTML).toBe(before)
    root.remove()
  })
})
