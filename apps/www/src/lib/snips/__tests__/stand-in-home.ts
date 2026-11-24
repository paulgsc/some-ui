/**
 * The stand-in home (`apps/mobile/compat/stub-home.mjs`) as a test calls it:
 * routes files laid one over another, each answer looked up by method and
 * path (query ignored) under home's `/api/v1`, an exact key first, then one
 * whose `:name` segments match, else a 200 `{}`; an `echo` route answers
 * `{ <echo>: <the request body> }`. The walks' and the snips' samples are
 * both read through it, so a test reads them as the capture serves them.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import { z } from "zod"

/** `apps/mobile`, where the stand-in home and the snips' sample live. */
const MOBILE = resolve(import.meta.dirname, "../../../../../mobile")

/** A routes file as `stub-home.mjs` reads it. */
const RoutesSchema = z.object({
  routes: z.record(
    z.string(),
    z.object({
      status: z.number().optional(),
      body: z.unknown().optional(),
      echo: z.string().optional(),
    })
  ),
})

type Routes = Readonly<
  Record<string, z.infer<typeof RoutesSchema>["routes"][string]>
>

/** A routes file's routes, given as parsed JSON. */
export const routesOf = (file: unknown): Routes =>
  RoutesSchema.parse(file).routes

/** A routes file's routes, by its path under `apps/mobile`. */
export const readRoutes = (path: string): Routes =>
  routesOf(JSON.parse(readFileSync(resolve(MOBILE, path), "utf8")))

/** The base routes every capture and walk starts from. */
export const BASE_ROUTES = readRoutes("compat/stub-routes.json")

/** A route key's path as a pattern, as `stub-home.mjs` reads it: each `:name` is one segment. */
const matches = (key: string, asked: string): boolean =>
  new RegExp(
    `^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:[a-z]+/gi, "[^/]+")}$`
  ).test(asked)

/** The stand-in home answering from `routes`, as `stub-home.mjs` does. */
export function standInHome(routes: Routes): HomeCall {
  return (method, path, body) => {
    const asked = `${method} /api/v1${path.split("?")[0] ?? ""}`
    const route = Object.hasOwn(routes, asked)
      ? routes[asked]
      : (Object.entries(routes).find(([key]) => matches(key, asked))?.[1] ?? {
          status: 200,
          body: {},
        })
    const answer: HomeAnswer = {
      status: route.status ?? 200,
      body: JSON.stringify(
        route.echo === undefined || route.echo === ""
          ? (route.body ?? null)
          : {
              [route.echo]: typeof body === "string" ? JSON.parse(body) : null,
            }
      ),
    }
    return Promise.resolve(answer)
  }
}
