/**
 * GitHub's public interface, read with no account: one `GET` under the
 * owner's repositories, through the shared fetch client (`@some-ui/fetch-kit`,
 * FK1's deadline). Nothing of the owner's is sent. The Asks page and the
 * Cooking page both read through here.
 */
import { apiClient } from "@some-ui/fetch-kit"
import { z } from "zod"

/** `path` under `repos/paulgsc/`, read as `schema`. */
export const readGithub = <T>(path: string, schema: z.ZodType<T>): Promise<T> =>
  apiClient.get(
    new URL(`https://api.github.com/repos/paulgsc/${path}`),
    { credentials: "omit", headers: { Accept: "application/vnd.github+json" } },
    schema
  )

/** One issue as GitHub lists it: a pull request carries `pull_request`. */
export const IssueSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  html_url: z.url(),
  body: z.string().nullable(),
  pull_request: z.unknown().optional(),
})

/** An ask issue's title, with the `[ASK]` the filing rule puts first left out. */
export const askTitle = (title: string): string =>
  title.replace(/^\s*\[ASK\]\s*/i, "")
