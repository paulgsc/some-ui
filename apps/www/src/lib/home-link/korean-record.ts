/**
 * The rest of Korean's part of the one drain (`./drain`, LA15; KO-HOME KH3,
 * #2103): each word set, word pace and sentence tally row read aloud, and
 * the practice record, the set left unfinished and the last answers, PUT to
 * home's Korean record under its kind (paulgsc/server `routes::korean`,
 * docs/identity.md invariant 25) and counted as home's only when home's
 * answer carries the very body sent. The grammar lens's entries go the same
 * way as their own part (`./lens-record`). Home keeps each change as a new
 * revision, so `sent.korean` holds each entry's digest as home read it back,
 * under `<kind>/<key>`, and a changed entry goes again.
 *
 * Phone to home only, and nothing here lets anything go: the phone reads
 * Korean from its own stores until it reads from home (KH4, #2104).
 */
import type { HomeCall } from "@some-ui/core-utils"
import { canonicalJson, fnv1a, isRecord, jsonOf } from "@some-ui/core-utils"
import type { KoreanEntry } from "@some-ui/topik"

import type { EachSent, LogReport } from "./leetype-log"
import { sendEach } from "./leetype-log"
import type { Sent } from "./sent"

/** An entry's key in `sent.korean`: its kind and its key on home. */
export const koreanKey = ({ kind, key }: KoreanEntry): string =>
  `${kind}/${key}`

/** A Korean entry's digest as `sent` keeps it: its canonical JSON's length and hash. */
export function bodyDigest(body: unknown): string {
  const text = canonicalJson(body)
  return `${String(text.length)}:${String(fnv1a(text))}`
}

const koreanDigest = ({ body }: KoreanEntry): string => bodyDigest(body)

/** The entries home does not hold as they are now. */
export function koreanToSend(
  entries: ReadonlyArray<KoreanEntry>,
  sent: Sent
): Array<KoreanEntry> {
  return entries.filter(
    (entry) => sent.korean[koreanKey(entry)] !== koreanDigest(entry)
  )
}

/** Whether home's answer to a Korean PUT carries `text` as the entry it now holds. */
export function homeHolds(body: string, text: string): boolean {
  const answer = jsonOf(body)
  return (
    isRecord(answer) &&
    isRecord(answer.entry) &&
    canonicalJson(answer.entry.body) === text
  )
}

const KOREAN_SENT: EachSent<KoreanEntry> = {
  path: ({ kind, key }) => `/korean/${kind}/${key}`,
  body: ({ body }) => body,
  heldAs: (entry, text, body) =>
    Promise.resolve(
      homeHolds(body, text) ? [koreanKey(entry), koreanDigest(entry)] : null
    ),
}

/** Sends `going` (`sendEach`); `held` hears each key `sent.korean` should remember. */
export async function sendKorean(
  going: ReadonlyArray<KoreanEntry>,
  send: HomeCall,
  report: LogReport,
  held: (key: string, digest: string) => void
): Promise<void> {
  await sendEach(going, KOREAN_SENT, send, report, held)
}
