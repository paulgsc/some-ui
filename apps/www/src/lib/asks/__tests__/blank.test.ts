/**
 * @vitest-environment node
 *
 * What a pasted result is blanked of before it is kept (C1096): every
 * shape of secret a step's log can carry, and nothing a log needs to say.
 */
import { describe, expect, it } from "vitest"

import { BLANKED, blankSecrets } from "@/lib/asks/blank"

describe("blanking a pasted result", () => {
  it.each([
    ["a GitHub token", "ghp_abcdefghijklmnopqrstuvwxyz0123456789"],
    [
      "a fine-grained GitHub token",
      "github_pat_11ABCDEFG0123456789_abcdefghij",
    ],
    [
      "a Grafana service account token",
      "glsa_AbCdEfGhIjKlMnOpQrStUvWxYz012345_0a1b2c3d",
    ],
    ["an API key", "sk-proj-abcdefghijklmnopqrstuv"],
    ["an AWS access key id", "AKIAIOSFODNN7EXAMPLE"],
    ["a web token", "eyJhbGciOi.eyJzdWIiOiIx.SflKxwRJSMeKKF2QT4"],
    ["openssl's random base64", "q0Xz3mW8+Yb1/Lk9TQv2Rn4Hs7Jd6Fc5Pa0Gt1Ue8Wo="],
    ["a 32-character hex key", "9f86d081884c7d659a2feaa0c55ad015"],
  ])("blanks %s", (_what, secret) => {
    expect(blankSecrets(`before ${secret} after`)).toBe(
      `before ${BLANKED} after`
    )
  })

  it("blanks a value set to a name that says it is secret", () => {
    expect(blankSecrets("SITE_SHOTS_GRAFANA_TOKEN=hunter2")).toBe(
      `SITE_SHOTS_GRAFANA_TOKEN=${BLANKED}`
    )
    expect(blankSecrets('password: "correct horse"')).toBe(
      `password: ${BLANKED}`
    )
    expect(blankSecrets("api-key = abc")).toBe(`api-key = ${BLANKED}`)
  })

  it("blanks a private key whole, even cut off", () => {
    const key =
      "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXk\n-----END OPENSSH PRIVATE KEY-----"
    expect(blankSecrets(`key:\n${key}\nok`)).toBe(`key:\n${BLANKED}\nok`)
    expect(blankSecrets("-----BEGIN RSA PRIVATE KEY-----\nMIIE")).toBe(BLANKED)
  })

  it("keeps what a log needs: commits, digests, addresses, words, numbers", () => {
    const log = [
      "Deployed 85ef265a1b2c3d4e5f60718293a4b5c6d7e8f901 to home",
      "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "https://github.com/paulgsc/some-ui/actions/runs/123456789",
      "Uploaded secret PAGES_TOKEN",
      "some-ui-mailbox-production-deployment-finished",
      "took 12.3s, exit 0",
    ].join("\n")
    expect(blankSecrets(log)).toBe(log)
  })
})
