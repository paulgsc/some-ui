/**
 * **MP1: a phone paired again with the same home and account keeps what it
 * knows home holds** (#3197, C751).
 *
 * - _Claim:_ in `lib/home-link`, the memory of what home holds
 *   (`./sent`'s `some-ui.home.sent.v1`) that a pairing to home `base` and
 *   account `account` left is read by a later pairing to the same `base`
 *   and `account`; a pairing to another home or account, or with a home
 *   that names no account, starts from nothing, as every pairing did before.
 * - _Family:_ how the later pairing came (a reinstall whose backup restored
 *   the memory but not the pairing, which `backup_rules.xml` leaves out by
 *   design; an Unpair then a pairing) × its home (the same, another) × its
 *   account (the same, another, none named) × the memory (left by a pairing
 *   that noted a scope, or by one from before MP1, with none).
 * - _Proof:_ this file, over the real link's pairing and record read, and
 *   `./sent`'s `readSent` and `rememberSent`.
 * - _Tolerance:_ a memory from before MP1 has no scope, so the first
 *   pairing after it starts from nothing once more.
 */
import { fakeClock } from "@/test-support/fake-clock"
import type { HomeAnswer, KeyedStorage } from "@some-ui/core-utils"
import { inMemoryStorage } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

import type { HomeRequest } from "@/lib/device-backend/native-http"
import { createHomeLink } from "@/lib/home-link/runtime"
import { notePairingScope, readSent, rememberSent } from "@/lib/home-link/sent"

const HOME = { base: "https://home.example/api/v1", host: "home.example" }
const OTHER = { base: "https://other.example/api/v1", host: "other.example" }

/** One install of the app: its own pairing record, the phone's storage. */
async function install(
  storage: KeyedStorage,
  credential: { record: string | null } = { record: null }
): Promise<ReturnType<typeof createHomeLink>> {
  const clock = fakeClock()
  const link = createHomeLink({
    credential: {
      read: () => Promise.resolve({ record: credential.record, lost: false }),
      write: (record) => {
        credential.record = record
        return Promise.resolve()
      },
      clear: () => {
        credential.record = null
        return Promise.resolve()
      },
    },
    request: (call: HomeRequest): Promise<HomeAnswer> =>
      Promise.resolve(
        call.url.endsWith("/auth/pairing/finish")
          ? { status: 200, body: JSON.stringify(answerOf(call)) }
          : { status: 200, body: "{}" }
      ),
    onHidden: () => (): void => undefined,
    now: clock.now,
    after: clock.after,
    noteScope: (id, scope) => notePairingScope(storage, id, scope),
  })
  await link.load()
  return link
}

/** Home's pairing answer, naming the account `account` holds for this call. */
let account: string | null = "acct-A"
const answerOf = (call: HomeRequest): Record<string, string> => ({
  token: `t-${call.url}`,
  phoneId: "phone-1",
  ...(account === null ? {} : { account }),
})

async function paired(
  link: Awaited<ReturnType<typeof install>>,
  home = HOME
): Promise<string> {
  await link.pair(home, "K7QF2M9X")
  const state = link.getSnapshot().link
  if (state.kind !== "paired") throw new Error("not paired")
  return state.id
}

/** A memory left by pairing `id`: home holds session s1. */
function remember(storage: KeyedStorage, id: string): void {
  rememberSent(storage, readSent(storage, id), { sessions: { s1: "held" } })
}

const held = (storage: KeyedStorage, id: string): unknown =>
  "s1" in readSent(storage, id).sessions
    ? readSent(storage, id).sessions.s1
    : null

describe("MP1: the memory of what home holds, across pairings", () => {
  it("is kept by a reinstall paired again with the same home and account", async () => {
    account = "acct-A"
    const storage = inMemoryStorage()
    const first = await paired(await install(storage))
    remember(storage, first)

    // Reinstalled: the backup restored the storage, never the pairing.
    const again = await paired(await install(storage))
    expect(again).not.toBe(first)
    expect(held(storage, again)).toBe("held")
  })

  it("is kept by an Unpair and a pairing again with the same account", async () => {
    account = "acct-A"
    const storage = inMemoryStorage()
    const link = await install(storage)
    remember(storage, await paired(link))
    await link.unpair()
    expect(held(storage, await paired(link))).toBe("held")
  })

  it("is kept once the next page load reads the pairing record back", async () => {
    account = "acct-A"
    const storage = inMemoryStorage()
    const credential: { record: string | null } = { record: null }
    const id = await paired(await install(storage, credential))
    remember(storage, id)
    // The scope noted is forgotten (another pairing's noted since, say);
    // the record's read notes it again.
    notePairingScope(storage, "someone-else", null)
    await install(storage, credential)
    expect(held(storage, id)).toBe("held")
  })

  for (const [what, then] of [
    ["another account", { account: "acct-B", home: HOME }],
    ["no account named", { account: null, home: HOME }],
    ["another home", { account: "acct-A", home: OTHER }],
  ] as const) {
    it(`starts from nothing with ${what}`, async () => {
      account = "acct-A"
      const storage = inMemoryStorage()
      remember(storage, await paired(await install(storage)))
      account = then.account
      expect(
        held(storage, await paired(await install(storage), then.home))
      ).toBe(null)
    })
  }

  it("starts from nothing over a memory from before MP1, which names no scope", async () => {
    account = "acct-A"
    const storage = inMemoryStorage()
    // Left by a pairing the link never noted a scope for.
    remember(storage, "old-pairing")
    expect(held(storage, await paired(await install(storage)))).toBe(null)
  })
})
