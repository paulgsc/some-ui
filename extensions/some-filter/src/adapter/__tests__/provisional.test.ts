import {
  clearAllProvisional,
  clearProvisionalThrough,
  markProvisional,
  PROVISIONAL_ATTR,
} from "@filter/adapter/provisional"
import { afterEach, describe, expect, it } from "vitest"

afterEach(() => {
  document.body.innerHTML = ""
  // Not redundant with the line above: a mark outside `<body>` would
  // survive it and silently join the next test's querySelectorAll.
  clearAllProvisional()
})

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

function attributeRecord(target: Node): MutationRecord {
  return {
    type: "attributes",
    target,
    addedNodes: emptyNodes(),
    removedNodes: emptyNodes(),
    previousSibling: null,
    nextSibling: null,
    attributeName: "class",
    attributeNamespace: null,
    oldValue: null,
  }
}

function connectedHost(): HTMLElement {
  const host = document.createElement("div")
  document.body.appendChild(host)
  return host
}

describe("markProvisional", () => {
  it("marks the added root and nothing beneath it", () => {
    const host = connectedHost()
    const subtree = document.createElement("div")
    subtree.innerHTML = "<ul><li>one</li><li>two</li></ul>"
    host.appendChild(subtree)

    expect(markProvisional([addedRecord(host)], 1)).toBe(1)

    // The root carries the mark; the CSS descendant combinator is what
    // reaches the rest. This is the property that makes the cost O(1) per
    // inserted subtree instead of O(nodes) — a version that walked would
    // pass a "the subtree is dark" test just as well and would have
    // reintroduced exactly the cost this design exists to avoid.
    expect(subtree.getAttribute(PROVISIONAL_ATTR)).toBe("1")
    expect(subtree.querySelectorAll(`[${PROVISIONAL_ATTR}]`)).toHaveLength(0)
  })

  it("ignores attribute records entirely", () => {
    const el = connectedHost()

    expect(markProvisional([attributeRecord(el)], 1)).toBe(0)
    expect(el.hasAttribute(PROVISIONAL_ATTR)).toBe(false)
  })

  it("never marks anything outside <body>", () => {
    const html = document.documentElement
    const record: MutationRecord = {
      ...attributeRecord(html),
      type: "childList",
      addedNodes: html.childNodes,
    }

    markProvisional([record], 1)

    expect(document.body.hasAttribute(PROVISIONAL_ATTR)).toBe(false)
    expect(html.hasAttribute(PROVISIONAL_ATTR)).toBe(false)
    // `<head>` is the live case: a body/head swap reports it as an added
    // node, it passes every element-shaped check, it paints nothing, and
    // the mark it keeps outlives any cleanup scoped to body content.
    expect(document.head.hasAttribute(PROVISIONAL_ATTR)).toBe(false)
  })

  it("skips extension-owned nodes", () => {
    const host = connectedHost()
    const own = document.createElement("style")
    own.setAttribute("data-my-ext", "")
    host.appendChild(own)

    expect(markProvisional([addedRecord(host)], 1)).toBe(0)
  })

  it("skips a node added and removed again in the same batch", () => {
    const orphaned = document.createElement("div")
    orphaned.appendChild(document.createElement("span"))

    expect(markProvisional([addedRecord(orphaned)], 1)).toBe(0)
  })

  it("does not rewrite a mark that already carries this generation", () => {
    const host = connectedHost()
    host.appendChild(document.createElement("div"))

    expect(markProvisional([addedRecord(host)], 3)).toBe(1)
    // An unchanged setAttribute still queues a MutationRecord, which is
    // phantom evidence of a change that did not happen (#831).
    expect(markProvisional([addedRecord(host)], 3)).toBe(0)
  })
})

describe("clearProvisionalThrough", () => {
  it("clears marks at or below the generation and keeps later ones", () => {
    const host = connectedHost()
    const sensed = document.createElement("div")
    const arrivedDuringTheRound = document.createElement("div")
    host.append(sensed, arrivedDuringTheRound)
    sensed.setAttribute(PROVISIONAL_ATTR, "4")
    arrivedDuringTheRound.setAttribute(PROVISIONAL_ATTR, "5")

    expect(clearProvisionalThrough(4)).toBe(1)

    // The round that sensed generation 4 has handed over for `sensed`, so
    // its fill can go. Generation 5 was inserted after that round scanned
    // and has been classified by nothing — clearing it would expose a
    // surface no verdict has ever covered, which is the single way this
    // design could still put white on screen.
    expect(sensed.hasAttribute(PROVISIONAL_ATTR)).toBe(false)
    expect(arrivedDuringTheRound.getAttribute(PROVISIONAL_ATTR)).toBe("5")
  })

  it("clears an unattributable mark rather than stranding it", () => {
    const el = connectedHost()
    el.setAttribute(PROVISIONAL_ATTR, "not-a-generation")

    expect(clearProvisionalThrough(1)).toBe(1)
    expect(el.hasAttribute(PROVISIONAL_ATTR)).toBe(false)
  })
})

describe("clearAllProvisional", () => {
  it("drops every mark and reports whether there was anything to drop", () => {
    const a = connectedHost()
    const b = connectedHost()
    a.setAttribute(PROVISIONAL_ATTR, "1")
    b.setAttribute(PROVISIONAL_ATTR, "99")

    expect(clearAllProvisional()).toBe(true)
    expect(document.querySelectorAll(`[${PROVISIONAL_ATTR}]`)).toHaveLength(0)
    expect(clearAllProvisional()).toBe(false)
  })
})
