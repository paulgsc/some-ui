/**
 * The LeetType operator routes of `file_host` (paulgsc/server,
 * `routes::db::leetype_operator`), as the round CRM needs them. The host
 * builds this over its `file_host` transport, as it builds
 * `LessonCrmClient`; this workspace knows nothing of URLs.
 *
 * Every operator route needs a passkey session whose subject the server
 * lists in `OPERATOR_SUBJECTS`: 401 without a session, 403 for anyone else.
 */
export type RoundCrmClient = {
  /** `GET /leetype/operator/rounds`: every round, retired included. */
  list: () => Promise<Array<OperatorRound>>
  /** `GET /leetype/rounds/:id`: the round's body, exactly as stored. */
  read: (id: string) => Promise<string>
  /** `PUT /leetype/operator/rounds/:id`, with the body `serializeRound` wrote. */
  write: (id: string, body: string) => Promise<RoundWritten>
  /** `POST /leetype/operator/rounds/:id/retire`. */
  retire: (id: string) => Promise<OperatorRound>
  /** `POST /leetype/operator/rounds/:id/restore`. */
  restore: (id: string) => Promise<OperatorRound>
}

/** μ for one member of `D`, as the server's edge table holds it. */
export type RoundWitness = {
  propositionId: string
  admissible: boolean
}

/** What the server keeps about a round, beside its verbatim body. */
export type OperatorRound = {
  id: string
  version: number
  publishedAt: string
  contentHash: string
  witnesses: Array<RoundWitness>
  /** `null` while the round is served to learners. */
  retiredAt: string | null
}

/** `leetype_round_repo::Change` on the server. */
export type RoundChange = "inserted" | "contentChanged" | "unchanged"

export type RoundWritten = {
  change: RoundChange
  round: OperatorRound
}
