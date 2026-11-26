/**
 * Home, as Studio's Previews reads and writes it (HOST16, #3558): the
 * `PreviewSource` over the link's one request per ask
 * (`lib/home-link/preview-reads`, LA8), each answer read as paulgsc/server's
 * `handlers::conversations` (#1245) means it. Every call resolves, and says
 * in the screen's own terms why it has nothing: not paired, out of reach, a
 * home that keeps no previews yet, or an answer this phone can't read. A
 * read that finds the link busy asks again a second later, at most ten
 * times, as Ideas on home's does. Phone-only.
 *
 * Each variant's clip is home's; this phone doesn't fetch it yet, so a card
 * shows its callouts and says where the clip will play.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { readAs } from "@some-ui/core-utils"
import type { HomeRead } from "@some-ui/soundbites"
import type { KeptChoice } from "@some-ui/video-render"
import { PreviewOfferSchema } from "@some-ui/video-render"
import { z } from "zod"

import type { PreviewsAsk } from "@/lib/home-link/preview-reads"
import { askPreviews } from "@/lib/home-link/preview-reads"
import { askWhileBusy } from "@/lib/home-link/while-busy"
import type {
  ConversationPreviews,
  PreviewSource,
  PreviewsRead,
  PreviewWrite,
} from "@/lib/preview-pick"

/** The most conversations the screen reads previews for, newest first. */
export const CONVERSATIONS_MOST = 10

/** `GET /conversations`: the subject's conversations, newest first. */
const ListSchema = z.object({
  conversations: z.array(
    z.object({
      id: z.string().min(1),
      topic: z.string(),
      offers: z.number().int().nonnegative(),
    })
  ),
  /** Conversations whose kept log home couldn't replay. */
  unreadable: z.array(z.string()).default([]),
})

const ChoiceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("variant"),
    variant: z.string().min(1),
    rule: z.string().min(1).optional(),
  }),
  z.object({ kind: z.literal("else"), said: z.string().min(1) }),
])

/** `GET /conversations/:id/previews`. */
const PreviewsSchema = z.object({
  previews: z.array(
    z.object({
      preview: z.string(),
      about: z.string(),
      recommended: z.string(),
      variants: z.array(
        z.object({
          variant: z.string(),
          title: z.string(),
          rule: z.string(),
          callouts: z.array(z.string()),
          video: z.string(),
        })
      ),
      approved: z.object({ chose: ChoiceSchema }).nullable(),
    })
  ),
  unreadable: z.array(z.string()),
})

/** Home's answer, once the link was free, or why there is none. */
type Answered =
  | { readonly kind: "answered"; readonly answer: HomeAnswer }
  | { readonly kind: "unpaired" }
  | { readonly kind: "away" }
  | { readonly kind: "busy" }

async function ask(what: PreviewsAsk): Promise<Answered> {
  const asked = await askWhileBusy(() => askPreviews(what))
  return asked.kind === "unreachable" ? { kind: "away" } : asked
}

async function read<T>(
  what: PreviewsAsk,
  schema: z.ZodType<T>
): Promise<HomeRead<T>> {
  const asked = await ask(what)
  if (asked.kind !== "answered") return asked
  const { status, body } = asked.answer
  // A home without paulgsc/server#1245 serves no such route.
  if (status === 404) return { kind: "older" }
  if (status !== 200) return { kind: "unreadable" }
  const value = readAs(schema, body)
  return value === null ? { kind: "unreadable" } : { kind: "read", value }
}

/**
 * A conversation's previews as the screen shows them, or null when one
 * isn't an offer this phone can read (the record's own bounds).
 */
function shown(
  id: string,
  topic: string,
  served: z.infer<typeof PreviewsSchema>
): ConversationPreviews {
  const previews = served.previews.map((p) => {
    const offer = PreviewOfferSchema.safeParse({
      preview: p.preview,
      about: p.about,
      recommended: p.recommended,
      variants: p.variants.map(({ video: _video, ...v }) => v),
    })
    if (!offer.success) return null
    const chose = p.approved?.chose
    const standing: KeptChoice | null =
      chose === undefined
        ? null
        : chose.kind === "else"
          ? chose
          : {
              kind: "variant",
              variant: chose.variant,
              rule:
                chose.rule ??
                p.variants.find((v) => v.variant === chose.variant)?.rule ??
                "",
            }
    return { ...offer.data, clips: {}, standing }
  })
  // An offer outside the record's bounds is one not shown, never the
  // whole conversation.
  const readable = previews.filter((p) => p !== null)
  return {
    id,
    topic,
    previews: readable,
    unshown: served.unreadable.length + previews.length - readable.length,
  }
}

async function conversation(
  id: string,
  topic: string
): Promise<HomeRead<ConversationPreviews>> {
  const served = await read(
    { kind: "previews", conversation: id },
    PreviewsSchema
  )
  return served.kind === "read"
    ? { kind: "read", value: shown(id, topic, served.value) }
    : served
}

/** `POST /conversations/:id/events` refused: the record's why, and where it would have been kept. */
const RefusedSchema = z.object({
  refused: z.object({ why: z.string().min(1) }),
  at: z.number().int().nonnegative(),
})

export const homePreviews: PreviewSource = {
  where: "home",
  async read(): Promise<HomeRead<PreviewsRead>> {
    const list = await read({ kind: "conversations" }, ListSchema)
    if (list.kind !== "read") return list
    const offering = list.value.conversations
      .filter((c) => c.offers > 0)
      .slice(0, CONVERSATIONS_MOST)
    const out: Array<ConversationPreviews> = []
    // One at a time: the link keeps one exchange with home at a time.
    for (const c of offering) {
      const one = await conversation(c.id, c.topic)
      if (one.kind !== "read") return one
      out.push(one.value)
    }
    return {
      kind: "read",
      value: { conversations: out, unreadable: list.value.unreadable.length },
    }
  },
  reread: (id) => conversation(id, ""),
  async approve(id, event): Promise<PreviewWrite> {
    const asked = await ask({ kind: "event", conversation: id, event })
    if (asked.kind !== "answered") return asked
    const { status, body } = asked.answer
    // 409: the record refused it (or home's clips aren't made), as it says.
    if (status === 409)
      return readAs(RefusedSchema, body) === null
        ? { kind: "unreadable" }
        : { kind: "refused" }
    // 201 kept; 200 the log's last already (a retried send).
    if (status !== 201 && status !== 200) return { kind: "unreadable" }
    // The topic is the screen's own: the read back keeps it.
    const now = await conversation(id, "")
    return { kind: "written", value: now.kind === "read" ? now.value : null }
  },
}
