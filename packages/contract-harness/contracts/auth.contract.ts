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
 * does, so the literals are the point. The extensions are pinned for the
 * same reason: they are what webauthn-rs asks of the authenticator
 * (`start_passkey_registration`, `start_discoverable_authentication`).
 *
 * A `finish` needs an authenticator's signature over the challenge, which a
 * harness cannot make, so each is pinned by its refusal of a body with no
 * ceremony, which signs nobody in and adds no passkey. Where passkeys are not
 * configured (the phone, a deployment without `WEBAUTHN_RP_ID`), every
 * ceremony is `503 feature_not_configured` instead.
 */

import { z } from "zod"

import { defineContract } from "../src/contract"

const base64url = z.string().regex(/^[A-Za-z0-9_-]+$/)

const timeout = z.number().int().positive()

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
      // ES256, then RS256.
      pubKeyCredParams: z.tuple([
        z.object({ type: z.literal("public-key"), alg: z.literal(-7) }),
        z.object({ type: z.literal("public-key"), alg: z.literal(-257) }),
      ]),
      attestation: z.literal("none"),
      authenticatorSelection: z.object({
        residentKey: z.literal("required"),
        requireResidentKey: z.literal(true),
        userVerification: z.literal("required"),
      }),
      extensions: z.object({
        credProps: z.literal(true),
        credentialProtectionPolicy: z.literal("userVerificationRequired"),
        enforceCredentialProtectionPolicy: z.literal(false),
        uvm: z.literal(true),
      }),
      timeout,
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
      extensions: z.object({ uvm: z.literal(true) }),
      timeout,
    }),
  }),
})

/**
 * Adding a passkey to the signed-in account: the registration options, and
 * the account's passkeys so the browser does not make a second on one
 * authenticator.
 */
const AddPasskeyStartedSchema = RegistrationStartedSchema.extend({
  options: z.object({
    publicKey: RegistrationStartedSchema.shape.options.shape.publicKey.extend({
      excludeCredentials: z.array(z.unknown()),
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
    id: "auth.register_finish_refused",
    module: "auth",
    method: "POST",
    path: "/auth/register/finish",
    summary: "a finish naming no ceremony is a 422, and no account is made",
    mutates: true,
    request: { body: {} },
    expect: { status: [422, 503] },
  }),

  defineContract({
    id: "auth.sign_in_finish_refused",
    module: "auth",
    method: "POST",
    path: "/auth/sign-in/finish",
    summary: "a finish naming no ceremony is a 422, and no one is signed in",
    mutates: true,
    request: { body: {} },
    expect: { status: [422, 503] },
  }),

  defineContract({
    id: "auth.passkeys_start",
    module: "auth",
    method: "POST",
    path: "/auth/passkeys/start",
    summary:
      "another passkey for the signed-in account: the registration options, excluding the passkeys it holds",
    session: true,
    // Like `register_start`, this opens an in-memory ceremony only.
    expect: {
      status: [200, 503],
      schemaFor: 200,
      schema: AddPasskeyStartedSchema,
    },
  }),

  defineContract({
    id: "auth.passkeys_finish_refused",
    module: "auth",
    method: "POST",
    path: "/auth/passkeys/finish",
    summary: "a finish naming no ceremony is a 422, and no passkey is added",
    session: true,
    mutates: true,
    request: { body: {} },
    expect: { status: [422, 503] },
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

  defineContract({
    id: "auth.sign_out_everywhere_signed_out",
    module: "auth",
    method: "POST",
    path: "/auth/sign-out-everywhere",
    summary:
      "ending every session is per person: without one it is a 401, and nothing ends",
    // Not probed signed in: it would end the session every later contract in
    // the run is signed in with.
    expect: { status: 401 },
  }),
]
