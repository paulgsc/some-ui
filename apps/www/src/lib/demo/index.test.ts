/**
 * @vitest-environment jsdom
 *
 * A viewer's sample (CLAUDE.md, "A viewer tries, and nothing is kept"):
 * drafts the composer could have made, in a page storage of their own.
 */

import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

const viewer = vi.hoisted(() => ({ build: true }))

vi.mock("@/lib/data-mode", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  get VIEWER_BUILD(): boolean {
    return viewer.build
  },
}))

const browserStorage = window.localStorage
const { demoSessions, seedDemo } = await import("@/lib/demo")
const { OFFERED_ACTIVITIES } = await import("@/lib/playable")
const { STORAGE_KEY } = await import("@/lib/tenant/sessions-repository")
const { SAMPLE_SESSION_NAME, viewerSessionFiles } = await import(
  "@/lib/demo/leetype-sample"
)
const { intakeSessionFile } = await import("@some-ui/leetype")
const { BORROWING_01, BORROWING_01_RUNS, SAMPLE_NOTES, viewerRustRoundsPorts } =
  await import("@/lib/demo/rust-rounds-sample")
const rustRounds = await import("@some-ui/rust-rounds")

afterEach(() => {
  window.localStorage.clear()
  viewer.build = true
})

describe("demoSessions", () => {
  it("drafts one session per offered activity, and one running the first two", () => {
    const sessions = demoSessions()
    expect(sessions).toHaveLength(OFFERED_ACTIVITIES.length + 1)
    for (const session of sessions) {
      expect(session.status).toBe("draft")
      expect(session.scenes).toHaveLength(session.activities.length)
      expect(session.totalDurationMs).toBeGreaterThan(0)
    }
    expect(sessions.at(-1)?.activities.map((a) => a.activityId)).toEqual(
      OFFERED_ACTIVITIES.slice(0, 2).map((activity) => activity.id)
    )
  })
})

describe("the viewer's storage", () => {
  it("is a copy of the page's own once installed, so nothing reaches the browser", async () => {
    await import("@/lib/demo/viewer-storage")
    expect(window.localStorage).not.toBe(browserStorage)
    expect(window.sessionStorage.getItem("anything")).toBeNull()

    seedDemo()

    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]")
    ).toEqual(demoSessions())
    expect(browserStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("is not seeded on the owner's builds", () => {
    viewer.build = false
    seedDemo()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})

describe("viewerSessionFiles", () => {
  it("holds Thread 1's first session, which the phone's own intake reads clean", async () => {
    const store = viewerSessionFiles()
    const [sample] = await store.list()
    expect(sample.name).toBe(SAMPLE_SESSION_NAME)
    const body = await store.read(SAMPLE_SESSION_NAME)
    const intake = intakeSessionFile(`${SAMPLE_SESSION_NAME}.json`, body ?? "")
    expect(intake).toMatchObject({
      ok: true,
      name: SAMPLE_SESSION_NAME,
      file: { title: sample.title, oneLine: sample.oneLine },
      findings: [],
    })
  })

  it("takes no picks: a viewer's samples are all it holds", async () => {
    const store = viewerSessionFiles()
    await expect(
      store.keep(
        { name: "mine", title: "Mine", oneLine: "One.", body: "{}" },
        new Date("2026-10-20T00:00:00.000Z")
      )
    ).rejects.toThrow()
    expect(await store.read("mine")).toBeNull()
  })
})

describe("the Rust Rounds sample", () => {
  const {
    expectMatches,
    INDEXING_01,
    INDEXING_01_RUNS,
    LOG_SCHEMA,
    lintRound,
    resolvePrograms,
    RoundSchema,
    RustcRunSchema,
    TutorNotesSchema,
  } = rustRounds

  it("is a round any tutor could have sent, which the phone plays clean", () => {
    expect(RoundSchema.parse(BORROWING_01)).toEqual(BORROWING_01)
    expect(TutorNotesSchema.parse(SAMPLE_NOTES)).toEqual(SAMPLE_NOTES)
    expect(
      lintRound(BORROWING_01, { schema: LOG_SCHEMA, sessions: [] })
    ).toEqual([])
    for (const card of BORROWING_01.cards) {
      if (card.kind === "refine") continue
      const run = RustcRunSchema.parse(BORROWING_01_RUNS[card.id])
      // The round's guess and rustc agree: nothing is logged as guessed wrong.
      expect(expectMatches(card.expect, run), card.id).toBe(true)
    }
  })

  it("holds the sample round once, in the page's storage, with no microphone", () => {
    const ports = viewerRustRoundsPorts()
    expect(ports.notes).toBeNull()
    const { held } = ports.store.open()
    expect(held.rounds).toEqual([BORROWING_01])
    expect(Object.keys(held.runs)).toEqual(
      ["a", "b", "c"].map((card) => `borrowing-01/${card}`)
    )
    expect(held.notes).toEqual([SAMPLE_NOTES])
    // A second opening in the same page finds it and holds nothing more.
    expect(viewerRustRoundsPorts().store.open().held.rounds).toHaveLength(1)
  })

  /** Which rustc is on the PATH, or null for none. */
  function rustcVersion(): string | null {
    try {
      return execFileSync("rustc", ["--version"], { encoding: "utf8" })
    } catch {
      return null
    }
  }

  /** The panic's thread id changes every run; the rest is as printed. */
  const steady = (text: string): string =>
    text.replace(/thread 'main' \(\d+\)/g, "thread 'main' (N)")

  /** What rustc 1.97.0 does with `program`, recorded as the samples were. */
  function record(program: string): {
    outcome: string
    compileStderr: string
    stdout: string
    stderr: string
  } {
    const dir = mkdtempSync(join(tmpdir(), "rust-rounds-sample-"))
    try {
      writeFileSync(join(dir, "main.rs"), program)
      const compiled = spawnSync("rustc", ["--edition", "2021", "main.rs"], {
        cwd: dir,
        env: { PATH: process.env.PATH ?? "" },
        encoding: "utf8",
      })
      if (compiled.status !== 0) {
        return {
          outcome: "compile-error",
          compileStderr: "",
          stdout: "",
          stderr: compiled.stderr,
        }
      }
      const ran = spawnSync(join(dir, "main"), { env: {}, encoding: "utf8" })
      return {
        outcome: ran.status === 0 ? "prints" : "panics",
        compileStderr: compiled.stderr,
        stdout: ran.stdout,
        stderr: steady(ran.stderr),
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  // The Done-when of #2241: the recorded results match rustc 1.97. CI has no
  // rustc, so this runs only where 1.97.0 is installed (`rustc --version`).
  it.skipIf(!(rustcVersion() ?? "").startsWith("rustc 1.97.0 "))(
    "matches what rustc 1.97.0 prints for every sample card, where it is installed",
    () => {
      const samples = [
        { round: INDEXING_01, runs: INDEXING_01_RUNS },
        { round: BORROWING_01, runs: BORROWING_01_RUNS },
      ]
      for (const { round, runs } of samples) {
        const programs = resolvePrograms(round)
        // Every card with a program has its run recorded, and only those.
        expect(Object.keys(runs).sort()).toEqual([...programs.keys()].sort())
        for (const [card, program] of programs) {
          const run = runs[card]
          const got = record(program)
          const where = `${round.id}/${card}`
          expect(got.outcome, where).toBe(run.outcome)
          if (run.outcome === "compile-error") {
            expect(got.stderr, where).toBe(run.stderr)
            continue
          }
          expect(got.compileStderr, where).toBe(run.compileStderr)
          expect(got.stdout, where).toBe(run.stdout)
          if (run.outcome !== "prints") {
            expect(got.stderr, where).toBe(steady(run.stderr))
          }
        }
      }
    },
    60_000
  )
})
