/**
 * Passkey auth: `/auth/*` (paulgsc/server `handlers/auth.rs`,
 * `docs/identity.md` "Passkey auth").
 *
 * Hand-written per `src/contract.ts`'s "oracle rule": each schema is what
 * `apps/www/src/lib/auth` and `lib/passkey` believe they receive, checked
 * by hand against the server's `CeremonyStarted` and `SessionView`.
 *
 * The registration options are pinned tighter than the client strictly
 * needs, on purpose. They are where the server's privacy promise meets the
 * browser (`docs/identity.md` invariant 7): `attestation: "none"`, a
 * discoverable credential so sign-in names no account, user verification,
 * and the fixed `user.name`. A server that drifted on any of them would
 * still work, and would quietly ask browsers for more than it says it
 * does, so the literals are the point.
 *
 * Only the `start` halves are probed. A `finish` needs an authenticator's
 * signature over the challenge, which a harness cannot make.
 */

import { z } from "zod"

import { defineContract } from "../src/contract"

const base64url = z.string().regex(/^[A-Za-z0-9_-]+$/)

const RegistrationStartedSchema = z.object({
  ceremony: base64url,
  options: z.object({
    publicKey: z.object({
      challenge: base64url,
      rp: z.object({ id: z.string(), name: z.string() }),
      user: z.object({
        id: base64url,
        name: z.literal("Some UI"),
        displayName: z.literal("Some UI"),
      }),
      attestation: z.literal("none"),
      authenticatorSelection: z.object({
        residentKey: z.literal("required"),
        requireResidentKey: z.literal(true),
        userVerification: z.literal("required"),
      }),
    }),
  }),
})

const SignInStartedSchema = z.object({
  ceremony: base64url,
  options: z.object({
    publicKey: z.object({
      challenge: base64url,
      rpId: z.string(),
      // Empty: a sign-in names no account. The browser offers whichever
      // passkeys it holds for the site.
      allowCredentials: z.array(z.unknown()).length(0),
      userVerification: z.literal("required"),
    }),
  }),
})

const SessionViewSchema = z.object({
  /** ms since the epoch. */
  expiresAt: z.number(),
})

export const contracts = [
  defineContract({
    id: "auth.register_start",
    module: "auth",
    method: "POST",
    path: "/auth/register/start",
    summary:
      "a new account's passkey options: no attestation, discoverable, verified, no name",
    // 503 is `feature_not_configured` (WEBAUTHN_RP_ID unset) or the daily
    // new-account cap. Starting opens an in-memory ceremony only; nothing
    // is stored until a `finish` the harness cannot sign.
    expect: {
      status: [200, 503],
      schemaFor: 200,
      schema: RegistrationStartedSchema,
    },
  }),

  defineContract({
    id: "auth.sign_in_start",
    module: "auth",
    method: "POST",
    path: "/auth/sign-in/start",
    summary: "username-less sign-in options that name no account",
    expect: {
      status: [200, 503],
      schemaFor: 200,
      schema: SignInStartedSchema,
    },
  }),

  defineContract({
    id: "auth.session_signed_out",
    module: "auth",
    method: "GET",
    path: "/auth/session",
    summary: "no session cookie is a 401, which the client reads as signed out",
    expect: { status: 401 },
  }),

  defineContract({
    id: "auth.session",
    module: "auth",
    method: "GET",
    path: "/auth/session",
    summary: "a live session reports when it ends",
    session: true,
    expect: { status: 200, schema: SessionViewSchema },
  }),

  defineContract({
    id: "auth.sign_out",
    module: "auth",
    method: "POST",
    path: "/auth/sign-out",
    summary:
      "ending this browser's session succeeds with or without one, so the client can always call it",
    // Without a cookie this ends nothing, so the default run is safe.
    expect: { status: 200 },
  }),
]
