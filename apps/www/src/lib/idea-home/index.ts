/**
 * Home, as Studio's Ideas on home reads and writes it (ST26 (c), #2453):
 * `@some-ui/soundbites`' `IdeasHome` port over the link's one request per
 * ask (`lib/home-link/idea-reads`, LA8), each answer read as
 * paulgsc/server's `handlers::ideas` means it. Every call resolves, and says
 * in the screen's own terms why it has nothing: not paired, out of reach, a
 * home that keeps no ideas yet, or an answer this phone can't read. A read
 * that finds the link busy with another run asks again a second later, at
 * most ten times, as My data's does, and says this phone was busy once it
 * stayed so. Phone-only (`build.paths.ts`).
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { readAs } from "@some-ui/core-utils"
import type {
  HomeIdea,
  HomeLists,
  HomeRead,
  HomeWrite,
  IdeasHome,
} from "@some-ui/soundbites"
import { z } from "zod"

import type { HomeAnswered } from "@/lib/home-link/home-read"
import { askHome, readHome } from "@/lib/home-link/home-read"
import type { IdeasAsk } from "@/lib/home-link/idea-reads"
import { askIdeas } from "@/lib/home-link/idea-reads"

/** `idea_repo::Idea`, as `GET /ideas` and `GET /ideas/:id` serve it. */
const IdeaSchema: z.ZodType<HomeIdea> = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  revision: z.number().int().positive(),
  sentAt: z.string().min(1),
  title: z.string().min(1),
  topic: z.string().min(1),
  format: z.enum(["short", "video"]),
  keywords: z.array(z.string()),
  questions: z.number().int().positive(),
  answers: z.array(
    z.object({
      question: z.string().min(1),
      note: z.string().nullable(),
      typed: z.string().nullable(),
      heard: z
        .object({ text: z.string(), heardAt: z.string().min(1) })
        .nullable(),
      setAside: z.boolean(),
      deletedAt: z.string().min(1).nullish(),
    })
  ),
  furnishing: z.boolean(),
  setAside: z.boolean(),
})

const IdeasSchema = z.object({
  ideas: z.array(IdeaSchema),
  more: z.boolean(),
})

const ListsSchema: z.ZodType<HomeLists> = z.object({
  topics: z.array(z.string()),
  keywords: z.array(z.string()),
})

const FurnishingSchema = z.object({ furnishing: z.boolean() })

const ask = (what: IdeasAsk): Promise<HomeAnswered> =>
  askHome(() => askIdeas(what))

/** `what`'s answer as `schema` reads it; a home without paulgsc/server#650 is `older`. */
const read = <T>(what: IdeasAsk, schema: z.ZodType<T>): Promise<HomeRead<T>> =>
  readHome(() => askIdeas(what), schema)

async function write<T>(
  what: IdeasAsk,
  done: (answer: HomeAnswer) => { readonly value: T } | null
): Promise<HomeWrite<T>> {
  const asked = await ask(what)
  if (asked.kind !== "answered") return asked
  const kept = done(asked.answer)
  return kept === null ? { kind: "refused" } : { kind: "written", ...kept }
}

/** `value` held, unless it is null. */
const held = <T>(value: T | null): { readonly value: T } | null =>
  value === null ? null : { value }

export const ideasHome: IdeasHome = {
  ideas: () => read({ kind: "ideas" }, IdeasSchema),
  lists: () => read({ kind: "lists" }, ListsSchema),
  furnish: (id, furnishing) =>
    write({ kind: "furnish", id, furnishing }, ({ status, body }) =>
      status === 200
        ? held(readAs(FurnishingSchema, body)?.furnishing ?? null)
        : null
    ),
  // A repeat is a 204 too: the first mark stands.
  setAside: (id) =>
    write({ kind: "setAside", id }, ({ status }) =>
      status === 204 ? { value: null } : null
    ),
  entry: (list, name, listed) =>
    write({ kind: "entry", list, name, listed }, ({ status, body }) =>
      status === 200 ? held(readAs(ListsSchema, body)) : null
    ),
}
