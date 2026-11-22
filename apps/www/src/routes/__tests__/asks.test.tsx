/**
 * @vitest-environment jsdom
 *
 * The desktop web's Asks page: both repositories' open asks, a decision by
 * its options and a checklist by its steps; choosing and ticking off grow
 * the ask's receipt, blanked, which the page shows and copies; and what it
 * says when the asks can't be read, or can't be read again.
 */
import {
  createTestQueryClient,
  withQueryClient,
} from "@/test-support/query-client"
import type { KeyedStorage } from "@some-ui/core-utils"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { BLANKED } from "@/lib/asks/blank"
import { keptReceipts } from "@/lib/asks/kept"
import { ASKS_WORDS as W } from "@/lib/asks/words"
import { AsksPage } from "@/components/asks"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const issue = (number: number, question: string, ask: object): object => ({
  number,
  title: `[ASK] ${question}`,
  html_url: `https://github.com/paulgsc/some-ui/issues/${String(number)}`,
  body: [
    "Prose.",
    "",
    "```json ask",
    JSON.stringify({ question, ...ask }),
    "```",
  ].join("\n"),
})

const decision = (number: number, question: string): object =>
  issue(number, question, {
    schema: "some-ui.ask/1",
    whyYours: "Only you decide it.",
    options: [
      { says: "Yes", unblocks: "the next story" },
      { says: "Not yet", unblocks: "nothing" },
    ],
    recommended: 0,
  })

const checklist = issue(3423, "Will you set up the keys?", {
  schema: "some-ui.ask/2",
  kind: "checklist",
  whyYours: "Only you can make a credential.",
  steps: [
    {
      says: "A Grafana key",
      where: "Grafana on home",
      do: ["Add a service account", "Copy its token"],
    },
    { says: "Redeploy home", do: ["Redeploy"], paste: "The log's last lines" },
  ],
  unblocks: "the server card's clip",
})

const answer = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })

const memory = (): KeyedStorage => {
  const items = new Map<string, string>()
  return {
    getItem: (key: string): string | null => items.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      items.set(key, value)
    },
    removeItem: (key: string): void => {
      items.delete(key)
    },
  }
}

describe("the Asks page", () => {
  it("lists both repositories' asks, each by its kind", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input) =>
        Promise.resolve(
          answer(
            String(input).includes("/server/")
              ? [decision(9, "Redeploy home?")]
              : [checklist]
          )
        )
      )
    render(withQueryClient(<AsksPage kept={keptReceipts(memory())} />))
    await screen.findByText("Redeploy home?")
    expect(fetch).toHaveBeenCalledTimes(2)
    screen.getByText("Will you set up the keys?")
    screen.getByText(`${W.kind.decision} · ${W.from.server}`)
    screen.getByText(`${W.kind.checklist} · ${W.from["some-ui"]}`)
    screen.getByText(W.recommended)
    screen.getByText(W.where("Grafana on home"))
    screen.getByText(W.stepsDone(0, 2))
    expect(screen.queryByText(W.receipt)).toBeNull()
  })

  it("puts each step ticked off on the receipt, blanked, and says what it holds", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) =>
      Promise.resolve(
        answer(String(input).includes("/server/") ? [] : [checklist])
      )
    )
    const kept = keptReceipts(memory())
    render(withQueryClient(<AsksPage kept={kept} />))
    await screen.findByText("Redeploy home")
    fireEvent.change(screen.getByLabelText(/The log's last lines/), {
      target: { value: "deployed; TOKEN=hunter2" },
    })
    const second = screen.getAllByRole("button", { name: W.done }).at(1)
    if (second === undefined) throw new Error("two steps, each with Done")
    fireEvent.click(second)
    screen.getByText(W.stepsDone(1, 2))
    screen.getByText(W.receiptHolds(1))
    expect(kept.getSnapshot().get("some-ui-3423")).toMatchObject([
      { says: "Redeploy home", pasted: `deployed; TOKEN=${BLANKED}` },
    ])
    expect(document.body.textContent).not.toContain("ask-receipt")
    screen.getByRole("button", { name: /Copy/ })
  })

  it("puts a choice on the receipt, and says which was chosen", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) =>
      Promise.resolve(
        answer(
          String(input).includes("/server/")
            ? [decision(9, "Redeploy home?")]
            : []
        )
      )
    )
    const kept = keptReceipts(memory())
    render(withQueryClient(<AsksPage kept={kept} />))
    const card = (await screen.findByText("Redeploy home?")).closest("article")
    if (card === null) throw new Error("each ask is an article")
    const notYet = within(card).getAllByRole("button", { name: W.choose }).at(1)
    if (notYet === undefined) throw new Error("two options, each a choice")
    fireEvent.click(notYet)
    screen.getByText(W.chosen)
    expect(kept.getSnapshot().get("server-9")).toMatchObject([
      { kind: "chose", says: "Not yet" },
    ])
  })

  it("keeps what was read when a refresh fails, and says so", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(() =>
        Promise.resolve(answer([decision(9, "Redeploy home?")]))
      )
      .mockImplementationOnce(() => Promise.resolve(answer([])))
      .mockResolvedValue(new Response("rate limited", { status: 403 }))
    const client = createTestQueryClient()
    render(withQueryClient(<AsksPage kept={keptReceipts(memory())} />, client))
    await screen.findByText("Redeploy home?")
    await act(() => client.refetchQueries())
    await screen.findByText(W.stale)
    screen.getByText("Redeploy home?")
  })

  it("says so when they can't be read, with a way to try again", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rate limited", { status: 403 })
    )
    render(withQueryClient(<AsksPage kept={keptReceipts(memory())} />))
    await screen.findByText(W.away)
    screen.getByRole("button", { name: W.tryAgain })
  })
})
