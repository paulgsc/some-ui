/**
 * Studio's Previews on home (HOST16, #3558; paulgsc/server
 * `handlers::conversations`, #1245): one request each time the screen opens
 * or is asked again, or each tap of a pick, through the link's `keep`
 * (LA8). The reads send nothing of the phone's; a pick sends only the
 * record's `approve` event. What the screen makes of the answers is
 * `lib/preview-home`'s, its one caller.
 */
import { assertNever } from "@some-ui/core-utils"
import type { ConversationEvent } from "@some-ui/video-render"

import { homeLink } from "./index"
import type { Asked } from "./while-busy"
import { asked } from "./while-busy"

/** The one request each ask may send. */
export type PreviewsAsk =
  | { readonly kind: "conversations" }
  | { readonly kind: "previews"; readonly conversation: string }
  | {
      readonly kind: "event"
      readonly conversation: string
      readonly event: Extract<ConversationEvent, { event: "approve" }>
    }

/** The ask's path under the API base. */
function previewsPath(ask: PreviewsAsk): string {
  switch (ask.kind) {
    case "conversations": {
      return "/conversations"
    }
    case "previews": {
      return `/conversations/${encodeURIComponent(ask.conversation)}/previews`
    }
    case "event": {
      return `/conversations/${encodeURIComponent(ask.conversation)}/events`
    }
    default: {
      return assertNever(ask)
    }
  }
}

/** Asks home once; never rejects. */
export async function askPreviews(ask: PreviewsAsk): Promise<Asked> {
  const path = previewsPath(ask)
  return asked(() =>
    homeLink().keep((send) =>
      ask.kind === "event"
        ? send("POST", path, JSON.stringify(ask.event))
        : send("GET", path)
    )
  )
}
