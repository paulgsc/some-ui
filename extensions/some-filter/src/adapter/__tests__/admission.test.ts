import {
  ADMISSION_NODE_BUDGET,
  ADMISSION_SPEND_BUDGET_MS,
  ADMISSION_WINDOW_MS,
  admit,
  buildAdmissionIndex,
  collectAdmissionCandidates,
  createAdmissionBudget,
} from "@filter/adapter/admission"
import type { FilterAction, SurfaceKey } from "@filter/adapter/contracts"
import { afterEach, describe, expect, it } from "vitest"

const WHITE: SurfaceKey = "rgb(255, 255, 255)"
const NEAR_BLACK: SurfaceKey = "rgb(10, 10, 10)"

afterEach(() => {
  document.body.innerHTML = ""
})

/**
 * Real `NodeList`s throughout, never a cast: `addedNodes` is the one input
 * this module actually walks, and a plain array would let a collection bug
 * that only shows up against a live `NodeList` pass here unnoticed. A host
 * element's own `childNodes` is the closest real thing to what an observer
 * delivers — and leaving the host detached is also how the
 * added-then-removed case below gets a genuinely disconnected node.
 */
function emptyNodes(): NodeList {
  return document.createDocumentFragment().childNodes
}

/** A `childList` record announcing `host`'s children as newly added. */
function addedRecord(host: Element): MutationRecord {
  return {
    type: "childList",
    target: host,
    addedNodes: host.childNodes,
    removedNodes: emptyNodes(),
    previousSibling: null,
    nextSibling: null,
    attributeName: null,
    attributeNamespace: null,
    oldValue: null,
  }
}

function attributeRecord(target: Node, name = "class"): MutationRecord {
  return {
    type: "attributes",
    target,
    addedNodes: emptyNodes(),
    removedNodes: emptyNodes(),
    previousSibling: null,
    nextSibling: null,
    attributeName: name,
    attributeNamespace: null,
    oldValue: null,
  }
}

/** A connected host whose children stand in for one batch's added nodes. */
function connectedHost(): HTMLElement {
  const host = document.createElement("div")
  document.body.appendChild(host)
  return host
}

describe("buildAdmissionIndex", () => {
  it("maps every tag-surface key to its role", () => {
    const actions: ReadonlyArray<FilterAction> = [
      { kind: "activate-theme", swatchId: "default" },
      { kind: "tag-surface", key: WHITE, role: "surface" },
      { kind: "emit-surface-color", key: WHITE, css: "rgb(20, 20, 24)" },
      { kind: "tag-surface", key: NEAR_BLACK, role: "preserve" },
    ]

    const index = buildAdmissionIndex(actions)

    expect(index.get(WHITE)).toBe("surface")
    expect(index.get(NEAR_BLACK)).toBe("preserve")
  })

  it("is empty for a round that activates no theme", () => {
    // A restore-native round has just torn every tag and the dynamic sheet
    // down; binding against keys from before it would write an attribute
    // that selects nothing.
    const index = buildAdmissionIndex([
      { kind: "restore-native" },
      { kind: "tag-surface", key: WHITE, role: "surface" },
    ])

    expect(index.size).toBe(0)
  })
})

describe("collectAdmissionCandidates", () => {
  it("collects an added node and its whole subtree", () => {
    const host = connectedHost()
    const menu = document.createElement("div")
    menu.innerHTML = "<ul><li>one</li><li>two</li></ul>"
    host.appendChild(menu)

    const candidates = collectAdmissionCandidates([addedRecord(host)])

    // menu, ul, li, li — the carriers a popup actually paints with are its
    // descendants, not the node the vendor happened to hand over.
    expect(candidates).toHaveLength(4)
    expect(candidates[0]).toBe(menu)
  })

  it("collects only the target of an attribute record, never its subtree", () => {
    const wrapper = connectedHost()
    wrapper.innerHTML = "<span>a</span><span>b</span>"

    const candidates = collectAdmissionCandidates([attributeRecord(wrapper)])

    expect(candidates).toEqual([wrapper])
  })

  it("never offers the canvas, which the static layer owns", () => {
    const candidates = collectAdmissionCandidates([
      attributeRecord(document.body),
      attributeRecord(document.documentElement),
    ])

    expect(candidates).toEqual([])
  })

  it("skips a node added and removed again within the same batch", () => {
    // Detached host: the record still names the node, but it has no
    // computed style worth reading and nothing left to flash.
    const orphaned = document.createElement("div")
    orphaned.appendChild(document.createElement("span"))

    const candidates = collectAdmissionCandidates([addedRecord(orphaned)])

    expect(candidates).toEqual([])
  })

  it("truncates at the budget rather than abandoning the batch", () => {
    const host = connectedHost()
    const big = document.createElement("div")
    for (let i = 0; i < ADMISSION_NODE_BUDGET * 2; i += 1) {
      big.appendChild(document.createElement("div"))
    }
    host.appendChild(big)

    const candidates = collectAdmissionCandidates([addedRecord(host)])

    expect(candidates).toHaveLength(ADMISSION_NODE_BUDGET)
  })

  it("still reaches a small popup that shares a batch with a large subtree", () => {
    const bigHost = connectedHost()
    const big = document.createElement("div")
    for (let i = 0; i < 4; i += 1) {
      big.appendChild(document.createElement("div"))
    }
    bigHost.appendChild(big)

    const popupHost = connectedHost()
    const popup = document.createElement("div")
    popupHost.appendChild(popup)

    const candidates = collectAdmissionCandidates([
      addedRecord(bigHost),
      addedRecord(popupHost),
    ])

    expect(candidates).toContain(popup)
  })
})

describe("createAdmissionBudget", () => {
  it("stops admitting once the window's allowance is spent", () => {
    let clock = 0
    const budget = createAdmissionBudget(() => clock)

    expect(budget.available()).toBe(true)
    budget.spend(ADMISSION_SPEND_BUDGET_MS)
    expect(budget.available()).toBe(false)
  })

  it("resets once the window rolls over", () => {
    let clock = 0
    const budget = createAdmissionBudget(() => clock)

    budget.available()
    budget.spend(ADMISSION_SPEND_BUDGET_MS * 4)
    expect(budget.available()).toBe(false)

    clock += ADMISSION_WINDOW_MS
    expect(budget.available()).toBe(true)
  })
})

describe("admit", () => {
  const keyByBackground =
    (colors: Record<string, SurfaceKey | undefined>) =>
    (el: HTMLElement): SurfaceKey | null =>
      colors[el.id] ?? null

  it("binds a candidate whose key the page already committed", () => {
    const el = document.createElement("div")
    el.id = "popup"
    document.body.appendChild(el)

    const admitted = admit(
      [el],
      new Map([[WHITE, "surface"]]),
      keyByBackground({ popup: WHITE })
    )

    expect(admitted).toBe(1)
    // Byte-identical to what `realize()`'s own tag-surface loop would have
    // written for this key — admission is the same tag, only sooner.
    expect(el.dataset.swPatched).toBe(WHITE)
  })

  it("writes the literal preserve value for a preserve-role key", () => {
    const el = document.createElement("div")
    el.id = "dark"
    document.body.appendChild(el)

    admit(
      [el],
      new Map([[NEAR_BLACK, "preserve"]]),
      keyByBackground({ dark: NEAR_BLACK })
    )

    expect(el.dataset.swPatched).toBe("preserve")
  })

  it("leaves an uncommitted key entirely alone", () => {
    const el = document.createElement("div")
    el.id = "novel"
    document.body.appendChild(el)

    const admitted = admit(
      [el],
      new Map([[WHITE, "surface"]]),
      keyByBackground({ novel: "rgb(1, 2, 3)" })
    )

    // The whole point of the restriction: a colour the page has never shown
    // before has no rule to bind to, so this pass emits nothing and the
    // debounced round handles it exactly as it did before admission existed.
    expect(admitted).toBe(0)
    expect(el.hasAttribute("data-sw-patched")).toBe(false)
  })

  it("admits nothing at all against an empty index", () => {
    const el = document.createElement("div")
    el.id = "popup"
    document.body.appendChild(el)

    expect(admit([el], new Map(), keyByBackground({ popup: WHITE }))).toBe(0)
    expect(el.hasAttribute("data-sw-patched")).toBe(false)
  })

  it("skips a candidate keyFor declines", () => {
    const el = document.createElement("div")
    el.id = "skipped"
    document.body.appendChild(el)

    admit([el], new Map([[WHITE, "surface"]]), () => null)

    expect(el.hasAttribute("data-sw-patched")).toBe(false)
  })

  it("binds every candidate sharing one key", () => {
    const a = document.createElement("div")
    a.id = "a"
    const b = document.createElement("div")
    b.id = "b"
    document.body.append(a, b)

    const admitted = admit(
      [a, b],
      new Map([[WHITE, "surface"]]),
      keyByBackground({ a: WHITE, b: WHITE })
    )

    expect(admitted).toBe(2)
    expect(a.dataset.swPatched).toBe(WHITE)
    expect(b.dataset.swPatched).toBe(WHITE)
  })
})
