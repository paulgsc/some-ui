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
    [
      "openssl's 20 random hex bytes",
      "4f3c2a1b0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b",
    ],
    [
      "openssl's 32 random hex bytes",
      "4f3c2a1b0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b",
    ],
    ["a header's credential", "Basic dXNlcjpwYXNzd29yZA=="],
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
      `password: "${BLANKED}"`
    )
    expect(blankSecrets("api-key = abc")).toBe(`api-key = ${BLANKED}`)
    expect(blankSecrets("JWT_SIGNING_KEY: abc")).toBe(
      `JWT_SIGNING_KEY: ${BLANKED}`
    )
    expect(blankSecrets("keyboard: us")).toBe("keyboard: us")
  })

  it("blanks a credential however its header or scheme is written", () => {
    for (const line of [
      "authorization: bearer abcdef123456",
      "Authorization: token abcdef123456",
    ])
      expect(blankSecrets(line)).toBe(`${line.split(":")[0]}: ${BLANKED}`)
  })

  it("blanks a secret in a query, a list, JSON or a flag", () => {
    expect(blankSecrets("curl https://x.example/cb?token=abc123def")).toBe(
      `curl https://x.example/cb?token=${BLANKED}`
    )
    expect(blankSecrets("user=admin,password=hunter2")).toBe(
      `user=admin,password=${BLANKED}`
    )
    expect(blankSecrets('{"password": "hunter2", "user": "me"}')).toBe(
      `{"password": "${BLANKED}", "user": "me"}`
    )
    expect(blankSecrets("login --password hunter2 --user me")).toBe(
      `login --password ${BLANKED} --user me`
    )
  })

  it("blanks quoted flags, camelCase names, escaped JSON and PGP keys", () => {
    expect(blankSecrets(`--password 'hunter 2' --user me`)).toBe(
      `--password '${BLANKED}' --user me`
    )
    for (const name of ["accessToken", "dbPassword", "clientSecret"])
      expect(blankSecrets(`${name}=abc`)).toBe(`${name}=${BLANKED}`)
    expect(blankSecrets('{\\"password\\":\\"hunter2\\"}')).toBe(
      `{\\"password\\":\\"${BLANKED}\\"}`
    )
    expect(blankSecrets('{"password": "a\\"b c"}')).toBe(
      `{"password": "${BLANKED}"}`
    )
    expect(
      blankSecrets(
        "-----BEGIN PGP PRIVATE KEY BLOCK-----\nlQOY\n-----END PGP PRIVATE KEY BLOCK-----"
      )
    ).toBe(BLANKED)
  })

  it("blanks passWord names, a setting inside a setting, and Authorization=", () => {
    expect(blankSecrets("passWord=abc PassPhrase: def")).toBe(
      `passWord=${BLANKED} PassPhrase: ${BLANKED}`
    )
    expect(blankSecrets("env: PASSWORD=hunter2")).toBe(
      `env: PASSWORD=${BLANKED}`
    )
    expect(blankSecrets('"cmd": "DB_PASSWORD=hunter2 ./x"')).toBe(
      `"cmd": "DB_PASSWORD=${BLANKED} ./x"`
    )
    expect(blankSecrets(`env: PASSWORD="hunter2" TOKEN='abc' x`)).toBe(
      `env: PASSWORD="${BLANKED}" TOKEN='${BLANKED}' x`
    )
    expect(blankSecrets('env: JAVA_OPTS="-Dpassword=hunter2 -Xmx1g"')).toBe(
      `env: JAVA_OPTS="-Dpassword=${BLANKED} -Xmx1g"`
    )
    expect(blankSecrets('env: FOO="a PASSWORD=b"')).toBe(
      `env: FOO="a PASSWORD=${BLANKED}"`
    )
    expect(blankSecrets('opts=--msg="run with PASSWORD=hunter2"')).toBe(
      `opts=--msg="run with PASSWORD=${BLANKED}"`
    )
    expect(blankSecrets("Authorization: Bearer a&b")).toBe(
      `Authorization: ${BLANKED}`
    )
    expect(blankSecrets("https://h/cb?authorization=abc&state=xyz")).toBe(
      `https://h/cb?authorization=${BLANKED}&state=xyz`
    )
    expect(blankSecrets("Authorization=Bearer abcdefghijklmnop")).toBe(
      `Authorization=${BLANKED}`
    )
  })

  it("blanks a header's value only, so the rest of a command stays", () => {
    expect(
      blankSecrets(
        "curl -H 'Authorization: Bearer abc123def' https://example.com/x -o out"
      )
    ).toBe(`curl -H 'Authorization: ${BLANKED}' https://example.com/x -o out`)
  })

  it("blanks a password in an address", () => {
    expect(blankSecrets("DATABASE_URL=postgres://admin:Hunter2pw@db/app")).toBe(
      `DATABASE_URL=postgres://admin:${BLANKED}@db/app`
    )
  })

  it("takes as long as the paste is long, whatever its shape", () => {
    const started = performance.now()
    for (const unit of [
      "token-",
      "a-",
      "x=",
      "aB1",
      "eyJabcdef-",
      '"a": "',
      "x=",
      "a: b=",
    ])
      blankSecrets(unit.repeat(20_000))
    expect(performance.now() - started).toBeLessThan(2_000)
  })

  it("blanks a private key whole, even cut off", () => {
    const key =
      "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXk\n-----END OPENSSH PRIVATE KEY-----"
    expect(blankSecrets(`key:\n${key}\nok`)).toBe(`key:\n${BLANKED}\nok`)
    expect(blankSecrets("-----BEGIN RSA PRIVATE KEY-----\nMIIE")).toBe(BLANKED)
  })

  it("keeps what a log needs: commits, digests, addresses, words, numbers", () => {
    const log = [
      "Deployed 85ef265 to home",
      "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "GIT_BRANCH=main",
      "Author: Claude <noreply@anthropic.com>",
      "author=me, Authorized: yes, authentication: ok, oauth_callback: done",
      "Basic information about the run. Token validation passed.",
      "Cache key: setup-node-Linux-x64-pnpm-abc",
      "Found in cache @ /opt/hostedtoolcache/Python/3.11.4/x64",
      "https://github.com/AnthropicLabs/SomeRepository/pull/1234",
      "/home/runner/work/MyOrgRepo/MyOrgRepo2/node_modules",
      "Run uses: docker://alpine:3.19@sha256:abc",
      "pass: 12  fail: 0",
      "https://github.com/paulgsc/some-ui/actions/runs/123456789",
      "Uploaded secret PAGES_TOKEN",
      "some-ui-mailbox-production-deployment-finished",
      "took 12.3s, exit 0",
    ].join("\n")
    expect(blankSecrets(log)).toBe(log)
  })
})
