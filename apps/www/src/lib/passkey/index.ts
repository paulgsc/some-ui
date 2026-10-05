/**
 * The browser half of a passkey ceremony: converts `file_host`'s base64url
 * WebAuthn JSON (`paulgsc/server` `handlers/auth.rs`) to and from
 * `navigator.credentials`' `ArrayBuffer`s, and nothing else.
 *
 * Not sent back: **`transports`** (the server discards them, and an unknown
 * value would make its library reject a good credential) and **client
 * extension results** (read by nobody).
 */

/**
 * `{ publicKey }` as `file_host` sends it for `navigator.credentials.create`,
 * naming only the members passed to the browser.
 */
export type CreationOptionsJSON = {
  publicKey: {
    rp: PublicKeyCredentialRpEntity
    user: { id: string; name: string; displayName: string }
    challenge: string
    pubKeyCredParams: Array<PublicKeyCredentialParameters>
    timeout?: number
    excludeCredentials?: ReadonlyArray<CredentialDescriptorJSON>
    authenticatorSelection?: AuthenticatorSelectionCriteria
    attestation?: AttestationConveyancePreference
  }
}

/** `{ publicKey }` as `file_host` sends it for `navigator.credentials.get`. */
export type RequestOptionsJSON = {
  publicKey: {
    challenge: string
    timeout?: number
    rpId?: string
    allowCredentials?: ReadonlyArray<CredentialDescriptorJSON>
    userVerification?: UserVerificationRequirement
  }
}

type CredentialDescriptorJSON = {
  type: "public-key"
  id: string
  transports?: ReadonlyArray<string>
}

export type RegistrationJSON = {
  id: string
  rawId: string
  type: string
  response: { attestationObject: string; clientDataJSON: string }
  extensions: Record<string, never>
}

export type AssertionJSON = {
  id: string
  rawId: string
  type: string
  response: {
    authenticatorData: string
    clientDataJSON: string
    signature: string
    userHandle: string | null
  }
  extensions: Record<string, never>
}

/** The browser offered no passkey, or the person dismissed the prompt. */
export class PasskeyCancelledError extends Error {
  constructor(cause?: unknown) {
    super("The passkey prompt was dismissed", { cause })
    this.name = "PasskeyCancelledError"
  }
}

/** Whether this browser can create and use passkeys here at all. */
export function passkeysSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof window.PublicKeyCredential === "function" &&
    "credentials" in navigator
  )
}

export function base64urlToBuffer(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
}

export function bufferToBase64url(buffer: ArrayBuffer): string {
  let binary = ""
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function descriptor(
  credential: CredentialDescriptorJSON
): PublicKeyCredentialDescriptor {
  return { type: credential.type, id: base64urlToBuffer(credential.id) }
}

function toCreationOptions(
  options: CreationOptionsJSON
): CredentialCreationOptions {
  const { publicKey } = options
  return {
    publicKey: {
      rp: publicKey.rp,
      user: { ...publicKey.user, id: base64urlToBuffer(publicKey.user.id) },
      challenge: base64urlToBuffer(publicKey.challenge),
      pubKeyCredParams: publicKey.pubKeyCredParams,
      timeout: publicKey.timeout,
      excludeCredentials: publicKey.excludeCredentials?.map(descriptor),
      authenticatorSelection: publicKey.authenticatorSelection,
      attestation: publicKey.attestation,
    },
  }
}

function toRequestOptions(
  options: RequestOptionsJSON
): CredentialRequestOptions {
  const { publicKey } = options
  return {
    publicKey: {
      challenge: base64urlToBuffer(publicKey.challenge),
      timeout: publicKey.timeout,
      rpId: publicKey.rpId,
      allowCredentials: publicKey.allowCredentials?.map(descriptor),
      userVerification: publicKey.userVerification,
    },
  }
}

function isPublicKeyCredential(
  value: Credential | null
): value is PublicKeyCredential {
  return value !== null && value.type === "public-key" && "rawId" in value
}

function isAttestation(
  response: AuthenticatorResponse
): response is AuthenticatorAttestationResponse {
  return "attestationObject" in response
}

function isAssertion(
  response: AuthenticatorResponse
): response is AuthenticatorAssertionResponse {
  return "signature" in response && "authenticatorData" in response
}

/** The browser answered with something that is not the ceremony asked for. */
function unexpectedResponse(): Error {
  return new Error("The browser returned an unexpected passkey response")
}

/** A dismissed prompt and "no passkey here" both surface as these. */
function isCancellation(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "AbortError")
  )
}

async function ask<T extends Credential | null>(
  request: () => Promise<T>
): Promise<PublicKeyCredential> {
  let credential: T
  try {
    credential = await request()
  } catch (error) {
    if (isCancellation(error)) throw new PasskeyCancelledError(error)
    throw error
  }
  if (!isPublicKeyCredential(credential)) throw new PasskeyCancelledError()
  return credential
}

/** Create a passkey from `file_host`'s options; returns what `…/finish` takes. */
export async function createPasskey(
  options: CreationOptionsJSON,
  container: CredentialsContainer = navigator.credentials
): Promise<RegistrationJSON> {
  const credential = await ask(() =>
    container.create(toCreationOptions(options))
  )
  const { response } = credential
  if (!isAttestation(response)) throw unexpectedResponse()
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      attestationObject: bufferToBase64url(response.attestationObject),
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
    },
    extensions: {},
  }
}

/** Sign with a passkey the browser holds; returns what `…/finish` takes. */
export async function signWithPasskey(
  options: RequestOptionsJSON,
  container: CredentialsContainer = navigator.credentials
): Promise<AssertionJSON> {
  const credential = await ask(() => container.get(toRequestOptions(options)))
  const { response } = credential
  if (!isAssertion(response)) throw unexpectedResponse()
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      authenticatorData: bufferToBase64url(response.authenticatorData),
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      signature: bufferToBase64url(response.signature),
      userHandle: response.userHandle
        ? bufferToBase64url(response.userHandle)
        : null,
    },
    extensions: {},
  }
}
