/**
 * @vitest-environment node
 *
 * Studio's ideas on home (ST26 (b), `../ideas`): one `PUT /ideas/:id` of
 * each idea sent whole that home doesn't hold as it is now, each answer home
 * can give read as `handlers::ideas::put_idea` means it, and nothing sent
 * again that home holds or refused as it is.
 */
import type { HomeCall } from "@some-ui/core-utils"
import { isRecord } from "@some-ui/core-utils"
import { reportFailure } from "@some-ui/intent-kit"
import type { IdeaForHome } from "@some-ui/soundbites"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { describe, expect, it, vi } from "vitest"

import { ideasWaiting, phoneIdeas, sendIdeas } from "@/lib/home-link/ideas"
import { ideasMoved, keepIdeas } from "@/lib/idea-keeping"

vi.mock("@some-ui/intent-kit", async (actual) => ({
  ...(await actual<object>()),
  reportFailure: vi.fn(),
}))

const AT = "2026-11-01T09:00:00.000Z"

function bundle(id: string, title = "Why the mic clips"): IdeaForHome {
  return {
    id,
    createdAt: AT,
    sentAt: "2026-11-01T09:10:00.000Z",
    title,
    topic: "Studio",
    format: "short",
    keywords: ["voice"],
    questions: 1,
    answers: [{ question: "what", note: `${id}-take` }],
  }
}

let handed: ReadonlyArray<IdeaForHome> = []
keepIdeas({ forHome: () => handed })

/** Home's answer to one idea's send, by its id. */
type Answer = { readonly status: number; readonly body?: unknown }

/** Home, answering each idea by its id; held (`200`, carried back) by default. */
function home(
  answers: Readonly<Record<string, Answer>>,
  sent: Array<[string, string, unknown]>
): HomeCall {
  return (method, path, body) => {
    sent.push([method, path, body])
    const sentIdea: unknown = JSON.parse(String(body))
    const id = decodeURIComponent(path.split("/")[2] ?? "")
    const answer = answers[id] ?? {
      status: 200,
      body: {
        change: "added",
        idea: { ...(isRecord(sentIdea) ? sentIdea : {}), revision: 1 },
      },
    }
    return Promise.resolve({
      status: answer.status,
      body: JSON.stringify(answer.body ?? {}),
    })
  }
}

const notesMissing: Answer = {
  status: 409,
  body: { error: { code: "conflict", details: { notes: ["n2"] } } },
}

describe("Studio's ideas on home (ST26 b)", () => {
  it("puts each idea home doesn't hold, its bundle as the body, and sends one home holds no more", async () => {
    const storage = memoryStorage()
    handed = [bundle("i1"), bundle("i/2")]
    const sent: Array<[string, string, unknown]> = []
    const moved = vi.fn()
    const stop = ideasMoved.subscribe(moved)
    expect(await sendIdeas(phoneIdeas(storage, "p1"), home({}, sent))).toEqual({
      kind: "synced",
    })
    stop()
    expect(sent).toEqual([
      ["PUT", "/ideas/i1", JSON.stringify(bundle("i1"))],
      ["PUT", "/ideas/i%2F2", JSON.stringify(bundle("i/2"))],
    ])
    expect(moved).toHaveBeenCalledTimes(2)
    expect(ideasWaiting(storage, "p1")).toEqual({ waiting: 0, held: 2 })

    const again: Array<[string, string, unknown]> = []
    await sendIdeas(phoneIdeas(storage, "p1"), home({}, again))
    expect(again).toEqual([])
    // Changed on the phone, it goes again; under another pairing, all go.
    handed = [bundle("i1", "A new title"), bundle("i/2")]
    expect(ideasWaiting(storage, "p1")).toEqual({ waiting: 1, held: 1 })
    expect(ideasWaiting(storage, "p2")).toEqual({ waiting: 2, held: 0 })
    expect(ideasWaiting(storage, null)).toEqual({ waiting: 2, held: 0 })
  })

  it("counts held only an idea home carries back as sent", async () => {
    const storage = memoryStorage()
    handed = [bundle("i1")]
    const other = { change: "added", idea: { ...bundle("i1"), title: "No" } }
    await sendIdeas(
      phoneIdeas(storage, "p1"),
      home({ i1: { status: 200, body: other } }, [])
    )
    expect(ideasWaiting(storage, "p1")).toEqual({ waiting: 1, held: 0 })
  })

  it("leaves an idea whose notes home lacks waiting, and goes on to the next", async () => {
    const storage = memoryStorage()
    handed = [bundle("i1"), bundle("i2")]
    const sent: Array<[string, string, unknown]> = []
    expect(
      await sendIdeas(
        phoneIdeas(storage, "p1"),
        home({ i1: notesMissing }, sent)
      )
    ).toEqual({ kind: "synced" })
    expect(sent).toHaveLength(2)
    expect(ideasWaiting(storage, "p1")).toEqual({ waiting: 1, held: 1 })
  })

  it("keeps a refused idea on the phone, offers it again only once it changes, and says so", async () => {
    vi.mocked(reportFailure).mockClear()
    const storage = memoryStorage()
    handed = [bundle("i1"), bundle("i2")]
    await sendIdeas(
      phoneIdeas(storage, "p1"),
      home({ i1: { status: 422 }, i2: { status: 409 } }, [])
    )
    expect(vi.mocked(reportFailure)).toHaveBeenCalledTimes(2)
    expect(ideasWaiting(storage, "p1")).toEqual({ waiting: 0, held: 0 })
    const again: Array<[string, string, unknown]> = []
    handed = [bundle("i1", "Fixed"), bundle("i2")]
    await sendIdeas(phoneIdeas(storage, "p1"), home({}, again))
    expect(again.map(([, path]) => path)).toEqual(["/ideas/i1"])
  })

  it("stops at a home that keeps no ideas yet, every idea still waiting, and at one that forgot this phone", async () => {
    const storage = memoryStorage()
    handed = [bundle("i1"), bundle("i2")]
    const sent: Array<[string, string, unknown]> = []
    expect(
      await sendIdeas(
        phoneIdeas(storage, "p1"),
        home({ i1: { status: 404 } }, sent)
      )
    ).toEqual({ kind: "synced" })
    expect(sent).toHaveLength(1)
    expect(ideasWaiting(storage, "p1").waiting).toBe(2)

    expect(
      await sendIdeas(
        phoneIdeas(storage, "p1"),
        home({ i1: { status: 401 } }, [])
      )
    ).toEqual({ kind: "forgotten" })
    expect(
      (
        await sendIdeas(
          phoneIdeas(storage, "p1"),
          home({ i1: { status: 503 } }, [])
        )
      ).kind
    ).toBe("failed")
    expect(ideasWaiting(storage, "p1").waiting).toBe(2)
  })
})
