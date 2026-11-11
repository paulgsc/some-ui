/**
 * The Monday routine's mailbox reads and puts (RR18, paulgsc/some-ui#2693),
 * over a `fetch` it is handed, so tests run it against a fake and nothing a
 * test writes reaches the live mailbox (MB1's rule for this routine).
 *
 * The API is `apps/mailbox`'s (README, "The API"): a listing is
 * `{"items":[{"seq","name","sha256",…}]}`, oldest first, paged by `after`; an
 * item's bytes are checked against the listing's `sha256`; a put answers
 * `201` (added) or `200` (the same bytes were already there).
 */
import { TRANSCRIPT_NAME } from "@rust-rounds/lib/monday/record"
import { isRecord } from "@some-ui/core-utils"

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export type Mailbox = {
  readonly url: string
  readonly token: string
  readonly fetch: Fetch
}

export type Listed = {
  readonly seq: number
  readonly name: string
  readonly sha256: string
}

const PAGE = 50

function auth(
  mailbox: Mailbox,
  extra: Record<string, string> = {}
): RequestInit {
  return { headers: { Authorization: `Bearer ${mailbox.token}`, ...extra } }
}

/** Every live item in `folder`, oldest first. */
export async function list(
  mailbox: Mailbox,
  folder: string
): Promise<Array<Listed>> {
  const items: Array<Listed> = []
  let after = 0
  for (;;) {
    const response = await mailbox.fetch(
      `${mailbox.url}/v1/${folder}/items?after=${after}&limit=${PAGE}`,
      auth(mailbox)
    )
    if (response.status !== 200) {
      throw new Error(
        `the mailbox's ${folder} listing answered ${response.status}`
      )
    }
    const body: unknown = await response.json()
    const page = isRecord(body) && Array.isArray(body.items) ? body.items : null
    if (page === null)
      throw new Error(`the mailbox's ${folder} listing isn't a listing`)
    if (page.length === 0) return items
    for (const item of page) {
      if (
        !isRecord(item) ||
        typeof item.seq !== "number" ||
        typeof item.name !== "string" ||
        typeof item.sha256 !== "string"
      ) {
        throw new Error(
          `the mailbox's ${folder} listing holds an item it can't read`
        )
      }
      items.push({ seq: item.seq, name: item.name, sha256: item.sha256 })
      after = Math.max(after, item.seq)
    }
  }
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/** One item's body, parsed, once its bytes match the listing's sum. */
export async function get(
  mailbox: Mailbox,
  folder: string,
  item: Listed
): Promise<unknown> {
  const response = await mailbox.fetch(
    `${mailbox.url}/v1/${folder}/items/${encodeURIComponent(item.name)}`,
    auth(mailbox)
  )
  if (response.status !== 200) {
    throw new Error(`${folder}/${item.name} answered ${response.status}`)
  }
  const bytes = await response.arrayBuffer()
  if ((await sha256Hex(bytes)) !== item.sha256) {
    throw new Error(`${folder}/${item.name}'s bytes don't match the listing`)
  }
  const body: unknown = JSON.parse(new TextDecoder().decode(bytes))
  return body
}

/** Puts `body` as `folder/name`; the answer's status and its text. */
export async function put(
  mailbox: Mailbox,
  folder: string,
  name: string,
  body: unknown
): Promise<{ status: number; text: string }> {
  const response = await mailbox.fetch(
    `${mailbox.url}/v1/${folder}/items/${encodeURIComponent(name)}`,
    {
      method: "PUT",
      body: `${JSON.stringify(body, null, 2)}\n`,
      ...auth(mailbox, { "Content-Type": "application/json" }),
    }
  )
  return { status: response.status, text: await response.text() }
}

/** The take and paste notes home's records name, whose transcripts the essay needs. */
export function notesNamed(
  records: ReadonlyArray<{
    readonly tickets: ReadonlyArray<{ readonly take: string | null }>
    readonly pastes: ReadonlyArray<{ readonly note: string | null }>
  }>
): Set<string> {
  const notes = new Set<string>()
  for (const record of records) {
    for (const ticket of record.tickets)
      if (ticket.take !== null) notes.add(ticket.take)
    for (const paste of record.pastes)
      if (paste.note !== null) notes.add(paste.note)
  }
  return notes
}

/** The note a transcript's name carries: `transcript-<note>-<n>.json`. */
export function noteOfTranscript(name: string): string | null {
  return TRANSCRIPT_NAME.exec(name)?.[1] ?? null
}
