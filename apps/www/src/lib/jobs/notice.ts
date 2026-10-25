/**
 * Whether home tells this phone when a morning run is in (RUN5, #2068), as a
 * value: what the person wants, the token the phone's push service gave it,
 * and which token home holds (paulgsc/server `PUT` and `DELETE /jobs/notice`,
 * RUN4). Pure: `./runtime` asks the push service for a token, and `./home`
 * files what `noticeFiling` says, so the record never says home holds a
 * token it was not told.
 *
 * The token names this install of the app to Google; it lives in the Jobs
 * record so a reload need not ask again, and goes nowhere but home.
 */
import { assertNever } from "@some-ui/core-utils"

export type NoticeState = {
  /** The person turned it on. */
  readonly wanted: boolean
  /** This phone's token, once the push service gave one. */
  readonly token: string | null
  /** The token home holds for this phone, as home last answered. */
  readonly filed: string | null
}

export const NO_NOTICE: NoticeState = {
  wanted: false,
  token: null,
  filed: null,
}

export type NoticeAction =
  | { type: "notice-wanted"; wanted: boolean }
  /** The push service's token, or none (home refused it as no token). */
  | { type: "notice-token"; token: string | null }
  /** Home answered: it holds `token` for this phone, or none. */
  | { type: "notice-filed"; token: string | null }

export function stepNotice(n: NoticeState, a: NoticeAction): NoticeState {
  switch (a.type) {
    case "notice-wanted": {
      return n.wanted === a.wanted ? n : { ...n, wanted: a.wanted }
    }
    case "notice-token": {
      return n.token === a.token ? n : { ...n, token: a.token }
    }
    case "notice-filed": {
      return n.filed === a.token ? n : { ...n, filed: a.token }
    }
    default: {
      return assertNever(a)
    }
  }
}

/** One request home is owed, or none. */
export type NoticeFiling = {
  readonly method: "PUT" | "DELETE"
  readonly token: string
} | null

/**
 * What home is owed next: first the token it holds that it no longer should
 * (turned off, or the phone's token changed), then the token it should hold.
 */
export function noticeFiling(n: NoticeState): NoticeFiling {
  if (n.filed !== null && (!n.wanted || n.token !== n.filed)) {
    return { method: "DELETE", token: n.filed }
  }
  if (n.wanted && n.token !== null && n.filed !== n.token) {
    return { method: "PUT", token: n.token }
  }
  return null
}
