/**
 * @vitest-environment jsdom
 *
 * The Asks pages (C1200) as the app routes them: the real frame and view,
 * under the route's own address reading. What a list or the pivot holds is
 * `lib/asks/__tests__/list.test.ts`'s; this holds that each is wired.
 */
import { MemoryRouted } from "@/test-support/memory-routed"
import {
  createTestQueryClient,
  withQueryClient,
} from "@/test-support/query-client"
import type { KeyedStorage } from "@some-ui/core-utils"
import type { QueryClient } from "@tanstack/react-query"
import type { AnyRoute } from "@tanstack/react-router"
import { createRootRoute, createRoute, Outlet } from "@tanstack/react-router"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { BLANKED } from "@/lib/asks/blank"
import type { KeptReceipts } from "@/lib/asks/kept"
import { keptReceipts } from "@/lib/asks/kept"
import type { AskView, ListState } from "@/lib/asks/list"
import { listSearch, viewParams } from "@/lib/asks/list"
import { ASKS_WORDS as W } from "@/lib/asks/words"
import { AsksFrame, AsksLanding, AsksView } from "@/components/asks"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const issue = (
  number: number,
  question: string,
  ask: object,
  closed: string | null = null
): object => ({
  number,
  title: `[ASK] ${question}`,
  html_url: `https://github.com/paulgsc/some-ui/issues/${String(number)}`,
  created_at: `2026-11-${String(10 + (number % 10))}T09:00:00Z`,
  closed_at: closed,
  body: [
    "Prose.",
    "",
    "```json ask",
    JSON.stringify({ question, ...ask }),
    "```",
  ].join("\n"),
})

const options = [
  { says: "Yes", unblocks: "the next story" },
  { says: "Not yet", unblocks: "nothing" },
]

/** A decision filed as `/3`: who waits, the call, what it unblocks. */
const decision = (
  number: number,
  question: string,
  shared: object = {},
  closed: string | null = null
): object =>
  issue(
    number,
    question,
    {
      schema: "some-ui.ask/3",
      kind: "decision",
      whyYours: "Only you decide it.",
      waits: "claude",
      call: "story",
      unblocks: "the voice story",
      options,
      recommended: 0,
      ...shared,
    },
    closed
  )

/** A decision filed before the shared part: none of it said. */
const decisionV1 = (number: number, question: string): object =>
  issue(number, question, {
    schema: "some-ui.ask/1",
    whyYours: "Only you decide it.",
    options,
  })

const checklist = issue(3423, "Will you set up the keys?", {
  schema: "some-ui.ask/3",
  kind: "checklist",
  whyYours: "Only you can make a credential.",
  waits: "pipeline",
  call: "environment",
  unblocks: "the server card's clip",
  steps: [
    {
      says: "A Grafana key",
      where: "Grafana on home",
      do: ["Add a service account", "Copy its token"],
    },
    { says: "Redeploy home", do: ["Redeploy"], paste: "The log's last lines" },
  ],
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

type Served = {
  server?: Array<object>
  ui?: Array<object>
  closed?: Array<object>
}

/** GitHub answers each read: each repository's open asks, and some-ui's closed. */
const serve = (byRepo: Served): void => {
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input)
    const closed = url.includes("state=closed")
    return Promise.resolve(
      answer(
        url.includes("/server/")
          ? closed
            ? []
            : (byRepo.server ?? [])
          : closed
            ? (byRepo.closed ?? [])
            : (byRepo.ui ?? [])
      )
    )
  })
}

/** The Asks pages as the app routes them, opened at `path`. */
const routed = (
  path: string,
  kept: KeptReceipts = keptReceipts(memory()),
  client?: QueryClient
): React.JSX.Element => {
  const tree = (): AnyRoute => {
    const root = createRootRoute()
    const layout = createRoute({
      getParentRoute: () => root,
      path: "/asks",
      component: () => (
        <AsksFrame>
          <Outlet />
        </AsksFrame>
      ),
    })
    const landing = createRoute({
      getParentRoute: () => layout,
      path: "/",
      component: AsksLanding,
    })
    const view = createRoute({
      getParentRoute: () => layout,
      path: "/$view",
      params: viewParams,
      validateSearch: listSearch,
      component: function View() {
        const { view: at }: { view: AskView } = view.useParams()
        const state: ListState = view.useSearch()
        return <AsksView view={at} state={state} kept={kept} />
      },
    })
    return root.addChildren([layout.addChildren([landing, view])])
  }
  return withQueryClient(
    <MemoryRouted initialTree={tree} initialPath={path} />,
    client
  )
}

/** The questions the list's rows ask, top to bottom. */
const rows = (): Array<string | null> =>
  screen
    .queryAllByRole("button", { expanded: false })
    .concat(screen.queryAllByRole("button", { expanded: true }))
    .map((b) => b.textContent)

describe("the Asks nav", () => {
  it("names each view, how many of each kind wait, and the asks it can't read", async () => {
    serve({
      server: [decision(9, "Redeploy home?")],
      ui: [
        checklist,
        decision(8, "Which voice?"),
        {
          number: 7,
          title: "[ASK] Something unread",
          html_url: "https://github.com/paulgsc/some-ui/issues/7",
          created_at: "2026-11-20T09:00:00Z",
          closed_at: null,
          body: "No block.",
        },
      ],
      closed: [decision(6, "Old one?", {}, "2026-11-21T09:00:00Z")],
    })
    render(routed("/asks/decisions"))
    const nav = await screen.findByRole("navigation", { name: W.nav })
    await within(nav).findByText(W.unreadHere(1))
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent)
    ).toEqual([
      `${W.views.decision}2`,
      `${W.views.checklist}1`,
      W.views.pivot,
      "Something unread",
    ])
    expect(within(nav).getByRole("link", { current: "page" }).textContent).toBe(
      `${W.views.decision}2`
    )
  })

  it("opens Asks at the first kind with an ask waiting", async () => {
    serve({ ui: [checklist] })
    render(routed("/asks"))
    await screen.findByRole("button", { name: "Will you set up the keys?" })
    expect(screen.getByRole("link", { current: "page" }).textContent).toContain(
      W.views.checklist
    )
  })

  it("finds nothing at an address no view has", async () => {
    serve({})
    render(routed("/asks/decision"))
    await screen.findByText(/not found/i)
  })
})

describe("an Asks list", () => {
  it("lists one kind alone, each row by the shared part, what was never said as such", async () => {
    serve({
      server: [decision(9, "Redeploy home?", { waits: "home" })],
      ui: [checklist, decisionV1(8, "Which voice?")],
    })
    render(routed("/asks/decisions"))
    const row = (
      await screen.findByRole("button", { name: "Redeploy home?" })
    ).closest("tr")
    if (row === null) throw new Error("each ask is a row")
    within(row).getByText(W.waits.home)
    within(row).getByText(W.calls.story)
    within(row).getByText("the voice story")
    const old = screen
      .getByRole("button", { name: "Which voice?" })
      .closest("tr")
    if (old === null) throw new Error("each ask is a row")
    expect(within(old).getAllByText(W.unsaid)).toHaveLength(3)
    expect(screen.queryByText("Will you set up the keys?")).toBeNull()
  })

  it("narrows when a chip is picked", async () => {
    serve({
      ui: [
        decision(1, "Which voice?"),
        decision(2, "Which key?", { waits: "home" }),
      ],
    })
    render(routed("/asks/decisions"))
    await screen.findByRole("button", { name: "Which voice?" })
    fireEvent.click(screen.getByRole("button", { name: `${W.waits.home} 1` }))
    await waitFor(() => expect(rows()).toEqual(["Which key?"]))
  })

  it("opens a checklist's row to its steps, and puts each step ticked off on the receipt, blanked", async () => {
    serve({ ui: [checklist] })
    const kept = keptReceipts(memory())
    render(routed("/asks/checklists", kept))
    fireEvent.click(
      await screen.findByRole("button", { name: "Will you set up the keys?" })
    )
    await screen.findByText(W.where("Grafana on home"))
    screen.getByText(W.stepsDone(0, 2))
    expect(screen.queryByText(W.receipt)).toBeNull()
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
    serve({ server: [decision(9, "Redeploy home?")] })
    const kept = keptReceipts(memory())
    render(routed("/asks/decisions", kept))
    fireEvent.click(
      await screen.findByRole("button", { name: "Redeploy home?" })
    )
    await screen.findByText(W.recommended)
    const notYet = screen.getAllByRole("button", { name: W.choose }).at(1)
    if (notYet === undefined) throw new Error("two options, each a choice")
    fireEvent.click(notYet)
    screen.getByText(W.chosen)
    expect(kept.getSnapshot().get("server-9")).toMatchObject([
      { kind: "chose", says: "Not yet" },
    ])
  })

  it("lists an ask closed between its reads once, answered, to be read only", async () => {
    const answered = decision(9, "Redeploy home?", {}, "2026-11-21T09:00:00Z")
    serve({ ui: [decision(9, "Redeploy home?")], closed: [answered] })
    render(routed("/asks/decisions?show=all"))
    fireEvent.click(
      await screen.findByRole("button", { name: "Redeploy home?" })
    )
    await screen.findByText(W.answeredHere)
    expect(rows()).toEqual(["Redeploy home?"])
    expect(screen.queryByRole("button", { name: W.choose })).toBeNull()
  })

  it("keeps what was read when a refresh fails, and says so", async () => {
    serve({ server: [decision(9, "Redeploy home?")] })
    const client = createTestQueryClient()
    render(routed("/asks/decisions", keptReceipts(memory()), client))
    await screen.findByText("Redeploy home?")
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rate limited", { status: 403 })
    )
    await act(() => client.refetchQueries())
    await screen.findByText(W.stale)
    screen.getByText("Redeploy home?")
  })

  it("says so when they can't be read, with a way to try again", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rate limited", { status: 403 })
    )
    render(routed("/asks/decisions"))
    await screen.findByText(W.away)
    screen.getByRole("button", { name: W.tryAgain })
  })
})

describe("the Asks pivot", () => {
  it("opens a cell's kind's list picked as the cell is, answered too when counted", async () => {
    serve({
      ui: [
        decision(1, "Which voice?"),
        decision(2, "Which key?", { call: "environment", waits: "home" }),
      ],
      closed: [decision(3, "Answered?", {}, "2026-11-21T09:00:00Z")],
    })
    render(routed("/asks/pivot"))
    const story = (await screen.findByText(W.calls.story)).closest("tr")
    if (story === null) throw new Error("each call is a row")
    fireEvent.click(screen.getByRole("button", { name: W.pivotCounts.all }))
    fireEvent.click(await within(story).findByText(W.inCell.decision(2)))
    await screen.findByRole("button", { name: "Answered?" })
    expect(rows()).toEqual(["Which voice?", "Answered?"])
  })
})
