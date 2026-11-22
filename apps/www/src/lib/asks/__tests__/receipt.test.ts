/**
 * @vitest-environment node
 *
 * An ask's receipt (C1096): each choice and each step appended, blanked,
 * in the order done; the text copied names what is done and what is left;
 * and the tab's store keeps it across a reload of the same tab.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import type { AskFile, ChecklistAsk, DecisionAsk } from "@some-ui/video-render"
import { describe, expect, it } from "vitest"

import { BLANKED } from "@/lib/asks/blank"
import { keptReceipts } from "@/lib/asks/kept"
import type { OpenAsk } from "@/lib/asks/model"
import type { Receipt } from "@/lib/asks/receipt"
import {
  appended,
  lastChosen,
  left,
  RECEIPT_SCHEMA,
  receiptText,
  stepsDone,
} from "@/lib/asks/receipt"

const AT = new Date("2026-11-22T16:00:00Z")

const checklist: ChecklistAsk = {
  schema: "some-ui.ask/2",
  kind: "checklist",
  question: "Will you set up the keys?",
  whyYours: "Only you can make a credential.",
  steps: [
    { says: "A Grafana key", do: ["Make it"] },
    { says: "Redeploy home", do: ["Redeploy"], paste: "The log's end" },
  ],
  unblocks: "the server card's clip",
  refs: [],
}

const decision: DecisionAsk = {
  schema: "some-ui.ask/2",
  kind: "decision",
  question: "Which voice?",
  whyYours: "A preference.",
  options: [
    { says: "Nicole", unblocks: "the call" },
    { says: "Adam", unblocks: "the call" },
  ],
  refs: [],
}

const open = (ask: AskFile): OpenAsk & { ask: AskFile } => ({
  id: "some-ui-3423",
  repo: "some-ui",
  number: 3423,
  url: "https://github.com/paulgsc/some-ui/issues/3423",
  title: ask.question,
  ask,
})

describe("a checklist's receipt", () => {
  it("appends each step done, blanked, and says what is left", () => {
    const one = appended([], checklist, {
      kind: "step",
      step: 1,
      pasted: "  done, TOKEN=abc  ",
      at: AT,
    })
    expect(one).toEqual([
      {
        kind: "step",
        step: 1,
        says: "Redeploy home",
        at: "2026-11-22T16:00:00.000Z",
        pasted: `done, TOKEN=${BLANKED}`,
      },
    ])
    expect([...stepsDone(checklist, one)]).toEqual([1])
    expect(left(checklist, one)).toEqual(["A Grafana key"])
    const text: unknown = JSON.parse(receiptText(open(checklist), one))
    expect(text).toMatchObject({
      schema: RECEIPT_SCHEMA,
      ask: "some-ui-3423",
      kind: "checklist",
      done: one,
      left: ["A Grafana key"],
    })
  })

  it("keeps nothing pasted as null, and a step done twice twice", () => {
    let receipt: Receipt = []
    for (const pasted of ["", "again"])
      receipt = appended(receipt, checklist, {
        kind: "step",
        step: 0,
        pasted,
        at: AT,
      })
    expect(receipt.map((e) => (e.kind === "step" ? e.pasted : "?"))).toEqual([
      null,
      "again",
    ])
    expect(left(checklist, receipt)).toEqual(["Redeploy home"])
  })

  it("knows a step by what it says, so steps edited since count as they read now", () => {
    const one = appended([], checklist, {
      kind: "step",
      step: 0,
      pasted: "",
      at: AT,
    })
    const moved: ChecklistAsk = {
      ...checklist,
      steps: [{ says: "A new first step", do: ["Do it"] }, ...checklist.steps],
    }
    expect([...stepsDone(moved, one)]).toEqual([1])
    expect(left(moved, one)).toEqual(["A new first step", "Redeploy home"])
  })

  it("ignores a step it hasn't, and a choice, which a checklist has none of", () => {
    const none: Receipt = []
    expect(
      appended(none, checklist, { kind: "step", step: 2, pasted: "", at: AT })
    ).toBe(none)
    expect(
      appended(none, checklist, { kind: "chose", option: 0, note: "", at: AT })
    ).toBe(none)
  })
})

describe("a decision's receipt", () => {
  it("appends each choice; the last one stands", () => {
    let receipt: Receipt = []
    for (const option of [0, 1])
      receipt = appended(receipt, decision, {
        kind: "chose",
        option,
        note: option === 1 ? "softer" : "",
        at: AT,
      })
    expect(lastChosen(decision, receipt)).toBe(1)
    expect(receipt.at(-1)).toMatchObject({ says: "Adam", note: "softer" })
    expect(left(decision, receipt)).toEqual([])
    expect(left(decision, [])).toEqual(["Which voice?"])
  })

  it("ignores an option it doesn't list, and a step", () => {
    const none: Receipt = []
    expect(
      appended(none, decision, { kind: "chose", option: 5, note: "", at: AT })
    ).toBe(none)
    expect(
      appended(none, decision, { kind: "step", step: 0, pasted: "", at: AT })
    ).toBe(none)
  })
})

describe("the tab's receipts", () => {
  const memory = (): KeyedStorage & { items: Map<string, string> } => {
    const items = new Map<string, string>()
    return {
      items,
      getItem: (key: string): string | null => items.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        items.set(key, value)
      },
      removeItem: (key: string): void => {
        items.delete(key)
      },
    }
  }

  it("keeps each ask's receipt across a reload of the tab, and tells its readers", () => {
    const tab = memory()
    const first = keptReceipts(tab)
    let told = 0
    first.subscribe(() => {
      told += 1
    })
    first.append("some-ui-3423", checklist, {
      kind: "step",
      step: 0,
      pasted: "",
      at: AT,
    })
    expect(told).toBe(1)
    expect(keptReceipts(tab).getSnapshot().get("some-ui-3423")).toHaveLength(1)
  })

  it("starts from nothing when what it holds can't be read, and keeps going when a write is refused", () => {
    const tab = memory()
    tab.items.set("some-ui:ask-receipts", "{not json")
    expect(keptReceipts(tab).getSnapshot().size).toBe(0)
    const full = keptReceipts({
      getItem: (): null => null,
      setItem: (): void => {
        throw new DOMException("full", "QuotaExceededError")
      },
      removeItem: (): void => undefined,
    })
    full.append("a", checklist, { kind: "step", step: 0, pasted: "", at: AT })
    expect(full.getSnapshot().get("a")).toHaveLength(1)
  })
})
