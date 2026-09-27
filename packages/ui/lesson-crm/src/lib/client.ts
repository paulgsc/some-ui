import type { TopikMetadata } from "@some-ui/topik"

/**
 * The operator routes of `file_host` (paulgsc/server,
 * `routes::db::curriculum_operator`), as the CRM needs them. The host builds
 * this - `apps/www` over its `file_host` transport - so this workspace knows
 * nothing of URLs, proxies or deadlines, and its tests hand it a fake.
 */
export type LessonCrmClient = {
  /** `GET /curriculum/operator/lessons`: every lesson, retired included. */
  list: () => Promise<Array<OperatorLesson>>
  /** `GET /curriculum/:key`: the lesson file, exactly as stored. */
  read: (key: string) => Promise<string>
  /** `PUT /curriculum/operator/lessons/:key`. */
  write: (key: string, lesson: LessonWrite) => Promise<LessonWritten>
  /** `POST /curriculum/operator/lessons/:key/retire`. */
  retire: (key: string) => Promise<OperatorLesson>
  /** `POST /curriculum/operator/lessons/:key/restore`. */
  restore: (key: string) => Promise<OperatorLesson>
}

/** A manifest entry plus what the server keeps about the lesson. */
export type OperatorLesson = TopikMetadata & {
  activityId: string
  publishedAt: string
  version: number
  contentHash: string
  /** `null` while the lesson is in the manifest - the weekly batch. */
  retiredAt: string | null
}

/**
 * What a save sends. `body` is stored byte for byte: the server hashes it to
 * decide whether the lesson changed, so it is always serialised the same way
 * (`servedBody`).
 */
export type LessonWrite = {
  activityId: string
  metadata: TopikMetadata
  body: string
}

/** `curriculum_repo::Change` on the server. Only the first two are news. */
export type LessonChange =
  | "inserted"
  | "contentChanged"
  | "metadataChanged"
  | "unchanged"

export type LessonWritten = {
  change: LessonChange
  lesson: OperatorLesson
}
