import { z } from "zod"

/**
 * Who a UI workspace is built for, and therefore which builds carry it.
 *
 * This is a bundle-size boundary, not an access-control one. A workspace whose
 * audience a build profile leaves out is replaced by an empty stub in that
 * build (see `audiencePlugin`), so a page that only does anything on the LAN -
 * a control panel for a service that only exists there - costs a public build
 * nothing. Nothing here hides or protects anything; whatever a LAN-only UI
 * talks to is the server's to guard.
 *
 * Adding an audience is adding a string here. Every profile, manifest and
 * gate is typed against this list, so a misspelt one fails `tsc` or the
 * manifest check rather than silently matching nothing.
 */
export const AUDIENCES = ["public", "lan"] as const

export const AudienceSchema = z.enum(AUDIENCES)
export type Audience = z.infer<typeof AudienceSchema>

/** The `package.json` key each `packages/ui/*` workspace must declare. */
export const MANIFEST_FIELD = "someUi"

/**
 * The shape of `package.json#someUi`. Required on every `packages/ui/*`
 * workspace, so no workspace ends up in or out of a build by omission:
 * `audiencePlugin` parses every manifest with this schema when it starts, and
 * a missing or invalid field fails `vite dev` and `vite build` alike.
 *
 * Strict: an unknown key is a typo of a known one until proven otherwise.
 */
export const SomeUiManifestFieldSchema = z.strictObject({
  audience: AudienceSchema,
})
export type SomeUiManifestField = z.infer<typeof SomeUiManifestFieldSchema>

/**
 * The one subpath of an excluded workspace that is never stubbed.
 *
 * Route definitions run code before any guard can: TanStack evaluates a
 * route's `validateSearch` while matching the URL. Anything a route needs at
 * that point - search schemas, param parsers, the types they infer - lives in
 * the workspace's `./contract` export, which ships in every profile and must
 * stay small. Components, queries and everything heavy live behind the main
 * entry and are stubbed out of profiles that don't include the audience.
 */
export const CONTRACT_SUBPATH = "/contract"

export type BuildProfile = {
  /** Audiences whose workspaces this build bundles. */
  readonly audiences: ReadonlyArray<Audience>
}

/**
 * Declares an app's named build profiles. An identity function whose only job
 * is to type the literal: profile names stay a literal union, and every
 * `audiences` entry is checked against `AUDIENCES`.
 */
export function defineProfiles<const P extends Record<string, BuildProfile>>(
  profiles: P
): P {
  return profiles
}

/**
 * Parses a manifest's `someUi` value, returning zod's issues on failure so a
 * caller can point at the exact key that is wrong.
 */
export function parseManifestField(
  value: unknown
): ReturnType<typeof SomeUiManifestFieldSchema.safeParse> {
  return SomeUiManifestFieldSchema.safeParse(value)
}
