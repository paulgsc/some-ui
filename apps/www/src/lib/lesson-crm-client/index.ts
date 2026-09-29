/**
 * `@some-ui/lesson-crm`'s client, over this app's `file_host` transport.
 *
 * The CRM workspace takes its client as a prop so it knows nothing of URLs,
 * the HTTPS proxy or deadlines; this is that client for `apps/www`, built on
 * `requestJSON` like every other `file_host` caller here. It imports nothing
 * from `@some-ui/lesson-crm` - that workspace's audience is `lan`, and only
 * files under `src/routes/_dashboard/_lan/` may import it - so the shapes
 * below are written out and checked against the CRM's `LessonCrmClient`
 * structurally, where the route hands this to it.
 */

import type {
  FileHostTransport,
  RequestOptions,
} from "@/lib/file-host-config/client"
import {
  createFileHostTransport,
  requestJSON,
} from "@/lib/file-host-config/client"

type Metadata = {
  key: string
  displayName: string
  description: string
  batchCount: number
  totalQuestions: number
  totalMessages: number
  difficulty?: "beginner" | "intermediate" | "advanced"
  tags?: Array<string>
}

type OperatorLesson = Metadata & {
  activityId: string
  publishedAt: string
  version: number
  contentHash: string
  retiredAt: string | null
}

type LessonWrite = { activityId: string; metadata: Metadata; body: string }

type LessonWritten = {
  change: "inserted" | "contentChanged" | "metadataChanged" | "unchanged"
  lesson: OperatorLesson
}

const lessonPath = (key: string): string =>
  `/curriculum/operator/lessons/${encodeURIComponent(key)}`

/**
 * `transport` is a seam for tests; the default resolves `file_host` the way
 * every caller in this app does (`lib/file-host-config`). A build with no
 * `file_host` at all gets a client whose every call rejects, saying so.
 */
export function createLessonCrmClient(
  transport: FileHostTransport | null = createFileHostTransport()
): {
  list: () => Promise<Array<OperatorLesson>>
  read: (key: string) => Promise<string>
  write: (key: string, lesson: LessonWrite) => Promise<LessonWritten>
  retire: (key: string) => Promise<OperatorLesson>
  restore: (key: string) => Promise<OperatorLesson>
} {
  const request = <T>(
    route: string,
    init?: RequestInit,
    options?: RequestOptions
  ): Promise<T> =>
    transport
      ? requestJSON<T>(transport, route, init, options)
      : Promise.reject(new Error("This build has no file_host to talk to."))

  return {
    list: async () =>
      (
        await request<{ lessons: Array<OperatorLesson> }>(
          "/curriculum/operator/lessons"
        )
      ).lessons,
    // The stored file comes back parsed, so this re-serialises it the way
    // the CRM writes one (two-space JSON and a newline). A lesson the CRM
    // saved reads back byte for byte; one the importer wrote may not, and
    // its first save from the CRM is then a new version.
    read: async (key) =>
      `${JSON.stringify(
        // The public curriculum module answers CORS without credentials,
        // so a credentialed read of it would be dropped cross-origin
        // (`createFileHostTransport`).
        await request<unknown>(`/curriculum/${encodeURIComponent(key)}`, {
          credentials: "same-origin",
        }),
        null,
        2
      )}\n`,
    write: (key, lesson) =>
      request<LessonWritten>(lessonPath(key), {
        method: "PUT",
        body: JSON.stringify(lesson),
      }),
    // POSTs that set a state rather than mint one: repeating either
    // converges, so a timed-out one may be retried.
    retire: (key) =>
      request<OperatorLesson>(
        `${lessonPath(key)}/retire`,
        { method: "POST" },
        { idempotent: true }
      ),
    restore: (key) =>
      request<OperatorLesson>(
        `${lessonPath(key)}/restore`,
        { method: "POST" },
        { idempotent: true }
      ),
  }
}
