/**
 * Studio's Takes › Needs your attention (HEARD3, #3075) as the phone draws
 * it, for `../attention-fit.spec.ts`: every code's group, with the widest
 * words a card says (a long take heard, several codes, the language heard),
 * one code picked, the way in on Takes' first page, nothing waiting, and a
 * phone not paired. Fakes for home and the player; a plain anchor for the
 * way in, since the page has no router.
 */
import type { JSX, ReactNode } from "react"
import type {
  AttentionRead,
  AttentionTake,
  ReconcileHome,
  TakeVerdict,
} from "@some-ui/soundbites"
import { AttentionWayIn, TakeReconcile } from "@some-ui/soundbites"
import type { Player } from "@some-ui/voice-capture"

const AT = "2026-11-14T09:00:00.000Z"

const LONG =
  "so the borrow checker sees the reference outlive the vector and it says no and then I would move the push before the borrow so that"

const verdict = (
  kind: TakeVerdict["kind"],
  reasons: ReadonlyArray<string>,
  language: TakeVerdict["language"] = null
): TakeVerdict => ({ kind, reasons, rule: "heard-1", language })

const take = (
  id: string,
  of: string,
  ref: string,
  heard: string | null,
  judged: TakeVerdict
): AttentionTake => ({
  id,
  of,
  ref,
  recordedAt: AT,
  heard,
  verdict: judged,
  // Home hears again a take it never heard (#3339).
  hearAgain:
    judged.kind === "failed" ? { askAgainAt: null, hearing: false } : null,
})

const TAKES: ReadonlyArray<AttentionTake> = [
  take(
    "r1",
    "rust-round",
    "w46:QM-311",
    LONG,
    verdict("garbled", ["low_confidence", "off_language", "sparse"], {
      heard: "pt",
      expected: "en",
    })
  ),
  take(
    "r2",
    "rust-round",
    "w46:QM-312",
    "the the the the the",
    verdict("garbled", ["repetitive"])
  ),
  take(
    "i1",
    "interview",
    "w46:behavioural-2",
    "mm",
    verdict("garbled", ["no_speech"])
  ),
  take("s1", "studio", "ep04:s3:2", null, verdict("nothing_said", [])),
  take("s2", "studio", "take:s2", null, verdict("failed", ["deadline"])),
  take("f1", "reflection", "2026-11-15", null, verdict("failed", ["engine"])),
  take("f2", "jobs", "j1", null, verdict("failed", ["mumbled"])),
]

const read = (answer: AttentionRead): ReconcileHome => ({
  takes: (): Promise<AttentionRead> => Promise.resolve(answer),
  audio: (): Promise<Blob | null> => Promise.resolve(null),
  act: () => Promise.resolve("kept"),
  hearAgain: () => Promise.resolve({ kind: "notTaken" }),
})

const LISTED: AttentionRead = {
  kind: "read",
  page: { takes: TAKES, total: TAKES.length },
}

const player: Player = {
  play: () => ({
    ended: new Promise<void>(() => undefined),
    stop: () => undefined,
  }),
}

const shown = (answer: AttentionRead = LISTED): (() => JSX.Element) => {
  const ports = { home: read(answer), player }
  const Shown = (): JSX.Element => (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Needs your attention</h1>
      <TakeReconcile
        ports={ports}
        pair={<a href="/settings">Pair with home</a>}
        deletable={(each) => each.of === "studio"}
        onDelete={() => undefined}
      />
    </div>
  )
  return Shown
}

const wayIn = (body: ReactNode): JSX.Element => (
  <a
    href="#attention"
    className="bg-card border-border/50 flex rounded-2xl border p-3 text-left"
  >
    {body}
  </a>
)

const WayIn = (): JSX.Element => (
  <div className="flex flex-col gap-4">
    <h1 className="text-2xl font-bold">Takes</h1>
    <p className="text-muted-foreground text-sm">Each kind in its place.</p>
    <AttentionWayIn ports={{ home: read(LISTED), player }} wayIn={wayIn} />
  </div>
)

export const ATTENTION_FIXTURES = {
  "attention-all": shown(),
  "attention-none": shown({ kind: "read", page: { takes: [], total: 0 } }),
  "attention-unpaired": shown({ kind: "unpaired" }),
  "attention-way-in": WayIn,
} satisfies Record<string, () => JSX.Element>

export type AttentionId = keyof typeof ATTENTION_FIXTURES
