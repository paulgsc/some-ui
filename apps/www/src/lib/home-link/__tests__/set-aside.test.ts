/**
 * @vitest-environment node
 *
 * Home's set-aside mark on a note let go on the phone (MIC2, `../set-aside`):
 * one `PUT` per mark due, with no body, and each answer home can give read
 * as `put_set_aside` means it.
 */
import type { HomeCall } from "@some-ui/core-utils"
import { reportFailure } from "@some-ui/intent-kit"
import { describe, expect, it, vi } from "vitest"

import { markSetAside, setAsidePath } from "@/lib/home-link/set-aside"
import type { AsideMark, AsidePort } from "@/lib/voice-home/model"

vi.mock("@some-ui/intent-kit", async (actual) => ({
  ...(await actual<object>()),
  reportFailure: vi.fn(),
}))

const AT = "2026-11-01T09:15:00.000Z"

/** A port over `due`, recording each answer. */
function port(due: ReadonlyArray<AsideMark>): AsidePort & {
  readonly answers: Array<[string, string]>
} {
  const answers: Array<[string, string]> = []
  return {
    answers,
    due: () => due,
    answered: (kind, id): void => {
      answers.push([kind, id])
    },
  }
}

/** Home, answering each mark by its note's id. */
function home(
  statuses: Readonly<Record<string, number>>,
  sent: Array<[string, string, unknown]>
): HomeCall {
  return (method, path, body) => {
    sent.push([method, path, body])
    const id = decodeURIComponent(path.split("/")[2] ?? "")
    return Promise.resolve({ status: statuses[id] ?? 204, body: "" })
  }
}

describe("home's set-aside mark (MIC2)", () => {
  it("names the note and when it was let go, encoded, and sends no body", async () => {
    expect(setAsidePath({ id: "a/b:c", at: AT })).toBe(
      "/voice-notes/a%2Fb%3Ac/set-aside?at=2026-11-01T09%3A15%3A00.000Z"
    )
    const sent: Array<[string, string, unknown]> = []
    const marks = port([{ id: "n1", at: AT }])
    expect(await markSetAside(marks, home({}, sent))).toEqual({
      kind: "synced",
    })
    expect(sent).toEqual([
      ["PUT", setAsidePath({ id: "n1", at: AT }), undefined],
    ])
    expect(marks.answers).toEqual([["marked", "n1"]])
  })

  it("leaves a mark home found no note for owed, gives up only on one home can't read, and goes on to the next", async () => {
    vi.mocked(reportFailure).mockClear()
    const marks = port([
      { id: "missing", at: AT },
      { id: "unreadable", at: "soon" },
      { id: "n3", at: AT },
    ])
    const sent: Array<[string, string, unknown]> = []
    expect(
      await markSetAside(marks, home({ missing: 404, unreadable: 422 }, sent))
    ).toEqual({ kind: "synced" })
    expect(sent).toHaveLength(3)
    expect(marks.answers).toEqual([
      ["unmarkable", "unreadable"],
      ["marked", "n3"],
    ])
    expect(vi.mocked(reportFailure)).toHaveBeenCalledTimes(2)
  })

  it("ends the run where home forgot the phone or answered otherwise, the mark still owed", async () => {
    for (const [status, end] of [
      [401, { kind: "forgotten" }],
      [403, { kind: "failed", why: "a set-aside mark: home answered 403" }],
      [500, { kind: "failed", why: "a set-aside mark: home answered 500" }],
    ] as const) {
      const marks = port([
        { id: "n1", at: AT },
        { id: "n2", at: AT },
      ])
      const sent: Array<[string, string, unknown]> = []
      expect(await markSetAside(marks, home({ n1: status }, sent))).toEqual(end)
      expect(sent).toHaveLength(1)
      expect(marks.answers).toEqual([])
    }
  })

  it("throws what a request that got no answer throws, answering nothing", async () => {
    const marks = port([{ id: "n1", at: AT }])
    const lost: HomeCall = () => Promise.reject(new Error("no answer"))
    await expect(markSetAside(marks, lost)).rejects.toThrow("no answer")
    expect(marks.answers).toEqual([])
  })
})
