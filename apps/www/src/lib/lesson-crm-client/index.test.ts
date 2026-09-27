import { describe, expect, it } from "vitest"

import type { FileHostTransport } from "@/lib/file-host-config/client"
import { createLessonCrmClient } from "@/lib/lesson-crm-client"

const lesson = {
  key: "week 40/a",
  displayName: "A",
  description: "d",
  batchCount: 1,
  totalQuestions: 1,
  totalMessages: 1,
  activityId: "topik",
  publishedAt: "2026-09-27T00:00:00+00:00",
  version: 1,
  contentHash: "h",
  retiredAt: null,
}

function recording(body: unknown): {
  transport: FileHostTransport
  calls: Array<[string, string]>
} {
  const calls: Array<[string, string]> = []
  const transport: FileHostTransport = (route, init) => {
    calls.push([init?.method ?? "GET", route])
    return Promise.resolve(Response.json(body))
  }
  return { transport, calls }
}

describe("createLessonCrmClient", () => {
  it("names the server's operator routes, with keys encoded", async () => {
    const { transport, calls } = recording(lesson)
    const client = createLessonCrmClient(transport)
    await client.retire(lesson.key)
    await client.restore(lesson.key)
    await client.write(lesson.key, {
      activityId: "topik",
      metadata: lesson,
      body: "[]\n",
    })
    expect(calls).toEqual([
      ["POST", "/curriculum/operator/lessons/week%2040%2Fa/retire"],
      ["POST", "/curriculum/operator/lessons/week%2040%2Fa/restore"],
      ["PUT", "/curriculum/operator/lessons/week%2040%2Fa"],
    ])
  })

  it("unwraps the listing and reads a lesson back the way the CRM writes one", async () => {
    const listed = recording({ lessons: [lesson] })
    expect(await createLessonCrmClient(listed.transport).list()).toEqual([
      lesson,
    ])
    expect(listed.calls).toEqual([["GET", "/curriculum/operator/lessons"]])

    const read = recording([{ id: 1 }])
    expect(await createLessonCrmClient(read.transport).read("a")).toBe(
      '[\n  {\n    "id": 1\n  }\n]\n'
    )
    expect(read.calls).toEqual([["GET", "/curriculum/a"]])
  })

  it("rejects, saying why, in a build with no file_host", async () => {
    await expect(createLessonCrmClient(null).list()).rejects.toThrow(
      /no file_host/
    )
  })
})
