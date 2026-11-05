/**
 * @vitest-environment node
 *
 * Studio's videos kept for home to make (ST33, `../videos`): one `PUT
 * /studio/videos/:video/queued/:rev` of each that home doesn't hold, its DNA
 * as the body, each answer home can give read as its handler means it, then
 * home's list read for where each stands; and Finish's port over it
 * (`../studio-videos`), in the person's terms.
 */
import type { HomeCall } from "@some-ui/core-utils"
import { reportFailure } from "@some-ui/intent-kit"
import type { StudioKeeping, VideoForHome } from "@some-ui/soundbites"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { describe, expect, it, vi } from "vitest"

import {
  phoneVideos,
  sendVideos,
  videoAnswers,
  videoHanded,
  videosListed,
  videosMoved,
  videosWaiting,
} from "@/lib/home-link/videos"
import { keepStudio } from "@/lib/studio-keeping"

vi.mock("@some-ui/intent-kit", async (actual) => ({
  ...(await actual<object>()),
  reportFailure: vi.fn(),
}))

function video(
  name: string,
  rev = 1,
  body = `{"video":"${name}"}`
): VideoForHome {
  return {
    key: `${name}/${String(rev)}`,
    video: name,
    rev,
    queuedAt: "2026-11-05T17:02:11.123Z",
    body,
  }
}

let kept: ReadonlyArray<VideoForHome> = []
const studio: StudioKeeping = {
  store: {
    list: () => Promise.resolve([]),
    audio: () => Promise.resolve(null),
    friction: () => Promise.resolve([]),
    subscribe: () => (): void => undefined,
  },
  timeLog: () => [],
  notesForHome: () => [],
  letGoHeldTakes: () => Promise.resolve(0),
  letGoDeletedTakes: () => Promise.resolve(0),
  letGo: () => null,
  waitingIds: () => [],
  letGoOnDrive: () => Promise.resolve(0),
  sittingKey: () => "s",
  videosForHome: () => kept,
}
keepStudio(studio)

/** Home's answer to one request, by its path. */
type Answer = { readonly status: number; readonly body?: unknown }

const LIST: Answer = {
  status: 200,
  body: {
    videos: [
      {
        video: "w3",
        rev: 1,
        title: "Weekly",
        queuedAt: "2026-11-05T17:02:11.123Z",
        storedAt: "2026-11-05T17:05:00.000Z",
        stage: "queued",
      },
      {
        video: "w4",
        rev: 2,
        title: "Weekly",
        queuedAt: "2026-11-05T17:02:11.123Z",
        storedAt: "2026-11-06T08:00:00.000Z",
        stage: "filled",
      },
    ],
  },
}

/** Home, answering by path: kept (`added`) and the list above by default. */
function home(
  answers: Readonly<Record<string, Answer>>,
  sent: Array<[string, string, unknown]>
): HomeCall {
  return (method, path, body) => {
    sent.push([method, path, body])
    const answer =
      answers[path] ??
      (method === "GET" ? LIST : { status: 200, body: { change: "added" } })
    return Promise.resolve({
      status: answer.status,
      body: JSON.stringify(answer.body ?? {}),
    })
  }
}

/** Home's refusal of takes it doesn't hold, as `PUT /ideas/:id` gives it too. */
const missing = (notes: ReadonlyArray<string>): Answer => ({
  status: 409,
  body: { error: { code: "conflict", details: { notes } } },
})

describe("Studio's videos made on home (ST33)", () => {
  it("puts each video home doesn't hold, its DNA as the body, then reads where each stands", async () => {
    const storage = memoryStorage()
    kept = [video("w3"), video("w/4", 2)]
    const sent: Array<[string, string, unknown]> = []
    const moved = vi.fn()
    const stop = videosMoved.subscribe(moved)
    expect(
      await sendVideos(phoneVideos(storage, "p1"), home({}, sent))
    ).toEqual({ kind: "synced" })
    stop()
    expect(sent).toEqual([
      ["PUT", "/studio/videos/w3/queued/1", '{"video":"w3"}'],
      ["PUT", "/studio/videos/w%2F4/queued/2", '{"video":"w/4"}'],
      ["GET", "/studio/videos", undefined],
    ])
    expect(moved).toHaveBeenCalled()
    expect(videoAnswers(storage, "p1")).toEqual({
      "w3/1": { kind: "held" },
      "w/4/2": { kind: "held" },
    })
    expect(videosWaiting(storage, "p1")).toBe(0)
    // A stage this version can't name is shown, as one it can't name yet.
    expect(videosListed("p1")).toEqual({
      "w3/1": { storedAt: "2026-11-05T17:05:00.000Z", stage: "queued" },
      "w4/2": { storedAt: "2026-11-06T08:00:00.000Z", stage: "other" },
    })
    expect(videosListed("p2")).toEqual({})

    const again: Array<[string, string, unknown]> = []
    await sendVideos(phoneVideos(storage, "p1"), home({}, again))
    expect(again).toEqual([["GET", "/studio/videos", undefined]])
    // Under another pairing, every one goes; unpaired, every one waits.
    expect(videosWaiting(storage, "p2")).toBe(2)
    expect(videosWaiting(storage, null)).toBe(2)
    expect(videoAnswers(storage, null)).toEqual({})
  })

  it("names the takes home doesn't hold yet, and sends the video again on the next run", async () => {
    const storage = memoryStorage()
    kept = [video("w3")]
    await sendVideos(
      phoneVideos(storage, "p1"),
      home({ "/studio/videos/w3/queued/1": missing(["t-open", "t-close"]) }, [])
    )
    expect(videoAnswers(storage, "p1")).toEqual({
      "w3/1": { kind: "missing", notes: ["t-open", "t-close"] },
    })
    expect(videosWaiting(storage, "p1")).toBe(1)
    const again: Array<[string, string, unknown]> = []
    await sendVideos(phoneVideos(storage, "p1"), home({}, again))
    expect(again.map(([method]) => method)).toEqual(["PUT", "GET"])
    expect(videoAnswers(storage, "p1")).toEqual({ "w3/1": { kind: "held" } })
  })

  it("keeps a refused video on the phone, says so as a fault, and offers it again only once its body changes", async () => {
    vi.mocked(reportFailure).mockClear()
    const storage = memoryStorage()
    kept = [video("w3"), video("w4"), video("w5")]
    await sendVideos(
      phoneVideos(storage, "p1"),
      home(
        {
          // Other bytes under a revision home holds: a 409 naming no notes.
          "/studio/videos/w3/queued/1": {
            status: 409,
            body: { error: { code: "conflict" } },
          },
          // A body home can't read as a DNA, whatever its details name.
          "/studio/videos/w4/queued/1": { status: 422 },
          "/studio/videos/w5/queued/1": {
            status: 422,
            body: {
              error: { code: "unprocessable", details: { notes: ["x"] } },
            },
          },
        },
        []
      )
    )
    expect(vi.mocked(reportFailure)).toHaveBeenCalledTimes(3)
    expect(videoAnswers(storage, "p1")).toEqual({
      "w3/1": { kind: "refused" },
      "w4/1": { kind: "refused" },
      "w5/1": { kind: "refused" },
    })
    expect(videosWaiting(storage, "p1")).toBe(0)
    kept = [
      video("w3", 1, '{"video":"w3","again":true}'),
      video("w4"),
      video("w5"),
    ]
    const again: Array<[string, string, unknown]> = []
    await sendVideos(phoneVideos(storage, "p1"), home({}, again))
    expect(again.map(([, path]) => path)).toEqual([
      "/studio/videos/w3/queued/1",
      "/studio/videos",
    ])
  })

  it("stops at a home that keeps no videos yet, saying so once a launch, and at one that forgot this phone", async () => {
    vi.mocked(reportFailure).mockClear()
    const storage = memoryStorage()
    kept = [video("w3"), video("w4")]
    const sent: Array<[string, string, unknown]> = []
    const older = home({ "/studio/videos/w3/queued/1": { status: 404 } }, sent)
    expect(await sendVideos(phoneVideos(storage, "p1"), older)).toEqual({
      kind: "synced",
    })
    await sendVideos(phoneVideos(storage, "p1"), older)
    expect(sent.map(([method]) => method)).toEqual(["PUT", "PUT"])
    expect(vi.mocked(reportFailure)).toHaveBeenCalledTimes(1)
    expect(videosWaiting(storage, "p1")).toBe(2)
    expect(
      await sendVideos(
        phoneVideos(storage, "p1"),
        home({ "/studio/videos/w3/queued/1": { status: 401 } }, [])
      )
    ).toEqual({ kind: "forgotten" })
    expect(
      (
        await sendVideos(
          phoneVideos(storage, "p1"),
          home({ "/studio/videos/w3/queued/1": { status: 503 } }, [])
        )
      ).kind
    ).toBe("failed")
    expect(videosWaiting(storage, "p1")).toBe(2)
  })

  it("ends the run on a list it can't read, and says nothing of a home with no list", async () => {
    const storage = memoryStorage()
    kept = [video("w5")]
    expect(
      (
        await sendVideos(
          phoneVideos(storage, "p9"),
          home({ "/studio/videos": { status: 200, body: { videos: 3 } } }, [])
        )
      ).kind
    ).toBe("failed")
    expect(
      await sendVideos(
        phoneVideos(storage, "p9"),
        home({ "/studio/videos": { status: 404 } }, [])
      )
    ).toEqual({ kind: "synced" })
    expect(videosListed("p9")).toEqual({})
  })

  it("counts a video Finish hands over as waiting at once, before the lane reads the projects", () => {
    const storage = memoryStorage()
    kept = []
    const before = videosWaiting(storage, "p7")
    const moved = vi.fn()
    const stop = videosMoved.subscribe(moved)
    videoHanded(video("new-one"))
    videoHanded(video("new-one"))
    stop()
    expect(moved).toHaveBeenCalledTimes(1)
    expect(videosWaiting(storage, "p7")).toBe(before + 1)
  })
})
