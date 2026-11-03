/**
 * Studio's Ideas on home and its lists (ST26 (c), #2453; paulgsc/server
 * `handlers::ideas`): one request each time the screen opens or is asked
 * again, or each tap of a write, through the link's `keep` (LA8). The reads
 * send nothing of the phone's; a write sends only the idea's id and the
 * mark, or the list's entry. What the screen makes of the answers is
 * `lib/idea-home`'s, its one caller.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { assertNever } from "@some-ui/core-utils"

import { homeLink, paired } from "./index"

/** The one request each ask may send. */
export type IdeasAsk =
  | { readonly kind: "ideas" }
  | { readonly kind: "lists" }
  | {
      readonly kind: "furnish"
      readonly id: string
      readonly furnishing: boolean
    }
  | { readonly kind: "setAside"; readonly id: string }
  | {
      readonly kind: "entry"
      readonly list: "topics" | "keywords"
      readonly name: string
      readonly listed: boolean
    }

/** The ask's path under the API base. */
function ideasPath(ask: IdeasAsk): string {
  switch (ask.kind) {
    case "ideas": {
      return "/ideas"
    }
    case "lists": {
      return "/idea-lists"
    }
    case "furnish": {
      return `/ideas/${encodeURIComponent(ask.id)}/furnishing`
    }
    case "setAside": {
      return `/ideas/${encodeURIComponent(ask.id)}/set-aside`
    }
    case "entry": {
      return `/idea-lists/${ask.list}/${encodeURIComponent(ask.name)}`
    }
    default: {
      return assertNever(ask)
    }
  }
}

/** Home's answer, or why there is none. */
export type IdeasAsked =
  | { readonly kind: "answered"; readonly answer: HomeAnswer }
  /** Not paired: nothing was asked. */
  | { readonly kind: "unpaired" }
  /** The link was busy with another run, or the page went: ask again. */
  | { readonly kind: "busy" }
  /** No answer. */
  | { readonly kind: "unreachable" }

/** Asks home once; never rejects. */
export async function askIdeas(ask: IdeasAsk): Promise<IdeasAsked> {
  if (!paired()) return { kind: "unpaired" }
  const path = ideasPath(ask)
  try {
    const outcome = await homeLink().keep((send) => {
      switch (ask.kind) {
        case "ideas":
        case "lists": {
          return send("GET", path)
        }
        case "furnish": {
          return send(
            "PUT",
            path,
            JSON.stringify({ furnishing: ask.furnishing })
          )
        }
        case "setAside": {
          return send("PUT", path)
        }
        case "entry": {
          return send(ask.listed ? "PUT" : "DELETE", path)
        }
        default: {
          return assertNever(ask)
        }
      }
    })
    return outcome?.kind === "done"
      ? { kind: "answered", answer: outcome.value }
      : { kind: "busy" }
  } catch {
    return { kind: "unreachable" }
  }
}
