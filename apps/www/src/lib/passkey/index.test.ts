/**
 * @vitest-environment jsdom
 *
 * The browser half of a passkey ceremony, against a fake
 * `CredentialsContainer`: what reaches `navigator.credentials` has its
 * binary fields decoded, and what goes back to `file_host` has them
 * re-encoded, with nothing added (no transports, no extension results).
 */

import { describe, expect, it } from "vitest"

import type { CreationOptionsJSON } from "@/lib/passkey"
import {
  base64urlToBuffer,
  bufferToBase64url,
  createPasskey,
  PasskeyCancelledError,
  signWithPasskey,
} from "@/lib/passkey"

const bytes = (...values: Array<number>): ArrayBuffer =>
  new Uint8Array(values).buffer

/** The bytes of a `BufferSource` the module handed the browser. */
function bytesOf(source: BufferSource | undefined): Array<number> {
  if (source instanceof ArrayBuffer) return [...new Uint8Array(source)]
  if (source !== undefined && ArrayBuffer.isView(source)) {
    return [
      ...new Uint8Array(source.buffer, source.byteOffset, source.byteLength),
    ]
  }
  throw new Error("not a buffer")
}

const RELYING_PARTY = {
  rp: { id: "app.test", name: "Some UI" },
  pubKeyCredParams: [{ type: "public-key", alg: -7 }],
} as const satisfies Partial<CreationOptionsJSON["publicKey"]>

type Fake = {
  container: CredentialsContainer
  created: Array<CredentialCreationOptions>
  requested: Array<CredentialRequestOptions>
}

function container(answer: () => Promise<Credential | null>): Fake {
  const created: Array<CredentialCreationOptions> = []
  const requested: Array<CredentialRequestOptions> = []
  const fake = {
    create: (
      options: CredentialCreationOptions
    ): Promise<Credential | null> => {
      created.push(options)
      return answer()
    },
    get: (options: CredentialRequestOptions): Promise<Credential | null> => {
      requested.push(options)
      return answer()
    },
  }
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a two-method fake of a browser interface
  const asContainer = fake as unknown as CredentialsContainer
  return { container: asContainer, created, requested }
}

function credential(response: Record<string, unknown>): Credential {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the fields the module reads, no more
  return {
    id: "Y3JlZA",
    rawId: bytes(99, 114, 101, 100),
    type: "public-key",
    response,
    getClientExtensionResults: () => ({ credProps: { rk: true } }),
  } as unknown as Credential
}

describe("base64url", () => {
  it("round-trips every byte value, without padding or url-unsafe characters", () => {
    const all = new Uint8Array(256).map((_, index) => index)
    const encoded = bufferToBase64url(all.buffer)
    expect(encoded).not.toMatch(/[+/=]/)
    expect(new Uint8Array(base64urlToBuffer(encoded))).toEqual(all)
  })
})

describe("createPasskey", () => {
  it("decodes the challenge, user id and excluded credentials, and sends back only what the server reads", async () => {
    const fake = container(() =>
      Promise.resolve(
        credential({
          attestationObject: bytes(1, 2, 3),
          clientDataJSON: bytes(4, 5),
          getTransports: () => ["internal", "hybrid"],
        })
      )
    )

    const sent = await createPasskey(
      {
        publicKey: {
          ...RELYING_PARTY,
          challenge: "AQID",
          user: { id: "BAUG", name: "Some UI", displayName: "Some UI" },
          excludeCredentials: [{ type: "public-key", id: "Bw" }],
          attestation: "none",
        },
      },
      fake.container
    )

    const publicKey = fake.created[0]?.publicKey
    expect(bytesOf(publicKey?.challenge)).toEqual([1, 2, 3])
    expect(bytesOf(publicKey?.user.id)).toEqual([4, 5, 6])
    expect(bytesOf(publicKey?.excludeCredentials?.[0]?.id)).toEqual([7])
    expect(publicKey?.attestation).toBe("none")

    expect(sent).toEqual({
      id: "Y3JlZA",
      rawId: "Y3JlZA",
      type: "public-key",
      response: { attestationObject: "AQID", clientDataJSON: "BAU" },
      extensions: {},
    })
  })

  it("reads a dismissed prompt as a cancellation, not a failure", async () => {
    const fake = container(() =>
      Promise.reject(
        new DOMException(
          "The operation either timed out or was not allowed.",
          "NotAllowedError"
        )
      )
    )
    await expect(
      createPasskey(
        {
          publicKey: {
            ...RELYING_PARTY,
            challenge: "AQ",
            user: { id: "AQ", name: "n", displayName: "n" },
          },
        },
        fake.container
      )
    ).rejects.toBeInstanceOf(PasskeyCancelledError)
  })
})

describe("signWithPasskey", () => {
  it("sends back the signature and the user handle that names the account", async () => {
    const fake = container(() =>
      Promise.resolve(
        credential({
          authenticatorData: bytes(1),
          clientDataJSON: bytes(2),
          signature: bytes(3),
          userHandle: bytes(9, 9),
        })
      )
    )

    const sent = await signWithPasskey(
      { publicKey: { challenge: "AQID", allowCredentials: [] } },
      fake.container
    )

    expect(sent.response).toEqual({
      authenticatorData: "AQ",
      clientDataJSON: "Ag",
      signature: "Aw",
      userHandle: "CQk",
    })
    expect(sent.extensions).toEqual({})
  })

  it("reads no credential at all as a cancellation", async () => {
    const fake = container(() => Promise.resolve(null))
    await expect(
      signWithPasskey({ publicKey: { challenge: "AQ" } }, fake.container)
    ).rejects.toBeInstanceOf(PasskeyCancelledError)
  })
})
