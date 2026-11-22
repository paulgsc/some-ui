/**
 * @vitest-environment jsdom
 *
 * The desktop web's Cooking page: the run's `[ORCH]` issue and what GitHub
 * says of each stop, read as it opens; the bar with the most urgent blocker,
 * the card with one stop, the trains as accordions; a pick anywhere moving
 * the card; and what it says with no run, a run it can't read, or no answer.
 */
import { withQueryClient } from "@/test-support/query-client"
import { RUN_SCHEMA } from "@some-ui/video-render"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react"
import type { MockInstance } from "vitest"
import { afterEach, describe, expect, it, vi } from "vitest"

import { forgetEnded } from "@/lib/cooking/read"
import { COOKING_WORDS as W } from "@/lib/cooking/words"
import { CookingPage } from "@/components/cooking"

afterEach(() => {
  forgetEnded()
  cleanup()
  vi.restoreAllMocks()
})

const run = {
  schema: RUN_SCHEMA,
  day: "2026-11-22",
  goals: [
    {
      id: "G1",
      kind: "deploy-home",
      title: "Deploy home",
      dest: "Home runs today's release",
      motive: "Home runs the newest release.",
      legs: [
        {
          leg: "merge",
          pr: { repo: "server", kind: "pr", number: 1129 },
          says: "Home's release",
        },
        { leg: "yours", says: "You deploy home" },
      ],
    },
    {
      id: "G2",
      kind: "install-apk",
      title: "Install the latest APK",
      dest: "The new app on your S21",
      motive: "The phone gets today's app.",
      legs: [
        {
          leg: "run",
          repo: "some-ui",
          run: 45065710340,
          says: "The APK is built",
        },
        {
          leg: "yours",
          ask: { repo: "some-ui", kind: "issue", number: 3433 },
          step: 1,
        },
      ],
    },
  ],
  workers: [],
  cleared: [],
}

const orch = (body: string): object => ({
  number: 3440,
  title: "[ORCH] Nov 22 run",
  html_url: "https://github.com/paulgsc/some-ui/issues/3440",
  state: "open",
  created_at: "2026-11-22T22:00:00Z",
  body,
})

const runBody = `The run.\n\n\`\`\`json run\n${JSON.stringify(run)}\n\`\`\`\n`

const ANSWERS: Record<string, unknown> = {
  "issues?labels=orch": [orch(runBody)],
  "server/pulls/1129": {
    html_url: "https://github.com/paulgsc/server/pull/1129",
    state: "open",
    created_at: "2026-11-22T21:07:01Z",
    merged_at: null,
    head: { sha: "abc" },
  },
  "server/commits/abc/check-runs": {
    check_runs: [
      { status: "completed", conclusion: "success" },
      { status: "in_progress", conclusion: null },
    ],
  },
  "actions/runs/45065710340": {
    html_url: "https://github.com/paulgsc/some-ui/actions/runs/45065710340",
    status: "completed",
    conclusion: "success",
    created_at: "2026-11-22T20:18:41Z",
    updated_at: "2026-11-22T20:43:45Z",
  },
  "some-ui/issues/3433": {
    number: 3433,
    title: "[ASK] Will you deploy home and install the APK?",
    html_url: "https://github.com/paulgsc/some-ui/issues/3433",
    state: "open",
    created_at: "2026-11-22T20:39:20Z",
    body: [
      "```json ask",
      JSON.stringify({
        schema: "some-ui.ask/2",
        kind: "checklist",
        question: "Will you deploy home and install the APK?",
        whyYours: "Each step runs on home or your phone.",
        steps: [
          { says: "Deploy home", do: ["make home-deploy"] },
          { says: "Install the APK", do: ["Install it over the old app"] },
        ],
        unblocks: "the stuck essays",
      }),
      "```",
    ].join("\n"),
  },
}

const answer = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

const github = (answers: Record<string, unknown>): MockInstance<typeof fetch> =>
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input instanceof Request ? input.url : input)
    const key = Object.keys(answers).find((k) => url.includes(k))
    return Promise.resolve(
      key === undefined ? answer({}, 404) : answer(answers[key])
    )
  })

describe("the Cooking page", () => {
  it("shows the most urgent blocker in the bar, and its stop in the card", async () => {
    const fetch = github(ANSWERS)
    render(withQueryClient(<CookingPage />))
    const bar = await screen.findByRole("button", {
      name: /wait on you|waits on you/,
    })
    expect(bar.textContent).toContain(W.waitOnYou(1))
    expect(bar.textContent).toContain("Install the APK")
    const card = screen.getByRole("region", {
      name: W.stopOf("Install the latest APK", 1, 3),
    })
    within(card).getByText(W.now.yours)
    screen.getByRole("button", { name: W.readAgain })
    // One list, one pull request and its checks, one run, one ask.
    expect(fetch).toHaveBeenCalledTimes(5)
  })

  it("moves the card to a stop picked on another train", async () => {
    github(ANSWERS)
    render(withQueryClient(<CookingPage />))
    const rail = (await screen.findByText("Deploy home")).closest("li")
    if (rail === null) throw new Error("each train is a list item")
    fireEvent.click(
      within(rail).getByRole("button", { name: "Home's release" })
    )
    const card = screen.getByRole("region", {
      name: W.stopOf("Deploy home", 0, 3),
    })
    within(card).getByText(W.now.checksRunning(1, 2))
    // Its accordion opened to its motive.
    screen.getByText("Home runs the newest release.")
  })

  it("says when a stop couldn't be read", async () => {
    const { "server/pulls/1129": _pull, ...rest } = ANSWERS
    github(rest)
    render(withQueryClient(<CookingPage />))
    await screen.findByText(W.someUnread(1))
  })

  it("says a blocker that isn't the owner's as someone else's", async () => {
    github({
      ...ANSWERS,
      "actions/runs/45065710340": {
        html_url: "https://github.com/paulgsc/some-ui/actions/runs/45065710340",
        status: "in_progress",
        conclusion: null,
        created_at: "2026-11-22T20:18:41Z",
        updated_at: "2026-11-22T20:30:00Z",
      },
    })
    render(withQueryClient(<CookingPage />))
    const bar = await screen.findByRole("button", {
      name: new RegExp(W.allMoving),
    })
    expect(bar.textContent).toContain(W.nothingOnYou)
    expect(bar.textContent).not.toContain("wait on you")
  })

  it("hands a check waiting on an approval to the owner", async () => {
    github({
      ...ANSWERS,
      "server/commits/abc/check-runs": {
        check_runs: [{ status: "completed", conclusion: "action_required" }],
      },
    })
    render(withQueryClient(<CookingPage />))
    const rail = (await screen.findByText("Deploy home")).closest("li")
    if (rail === null) throw new Error("each train is a list item")
    fireEvent.click(
      within(rail).getByRole("button", { name: "Home's release" })
    )
    within(
      screen.getByRole("region", { name: W.stopOf("Deploy home", 0, 3) })
    ).getByText(W.now.approve)
  })

  it("reads again when asked, without asking again for what has ended", async () => {
    const fetch = github(ANSWERS)
    render(withQueryClient(<CookingPage />))
    const again = await screen.findByRole("button", { name: W.readAgain })
    expect(fetch).toHaveBeenCalledTimes(5)
    fireEvent.click(again)
    await screen.findByRole("button", { name: W.readAgain })
    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(9)
    })
    // The run that passed is kept; the list, the open pull request and its checks, and the ask are read again.
    const runs = fetch.mock.calls.filter(([input]) =>
      String(input).includes("actions/runs")
    )
    expect(runs).toHaveLength(1)
  })

  it("says so when no run is open", async () => {
    github({ "issues?labels=orch": [] })
    render(withQueryClient(<CookingPage />))
    await screen.findByText(W.noRun)
  })

  it("links the run's page when its record can't be read", async () => {
    github({ "issues?labels=orch": [orch("No block here.")] })
    render(withQueryClient(<CookingPage />))
    await screen.findByText(W.runPage)
  })

  it("says so when GitHub doesn't answer, with a way to try again", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rate limited", { status: 403 })
    )
    render(withQueryClient(<CookingPage />))
    await screen.findByText(W.away)
    screen.getByRole("button", { name: W.tryAgain })
  })
})
