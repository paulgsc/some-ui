// Ambient declaration for the module `audiencePlugin` serves. Pull it into an
// app with `/// <reference types="@some-ui/vite-config/build-profile-client" />`.
declare module "virtual:build-profile" {
  import type { Audience } from "@some-ui/vite-config/audience"

  /** The profile this bundle was built with, e.g. "pages" or "lan". */
  export const profile: string
  /** The audiences whose workspaces this bundle carries. */
  export const audiences: ReadonlyArray<Audience>
  export function hasAudience(audience: Audience): boolean
}
