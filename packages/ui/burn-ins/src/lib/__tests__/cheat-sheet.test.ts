/** @vitest-environment node */
import { BADGE_STATES } from "@burn-ins/lib/badge"
import { frameAt, prepare } from "@burn-ins/lib/burn-in"
import { cardBody, ITEM } from "@burn-ins/lib/cards"
import {
  holdsAtEveryCount,
  MOST_ROWS,
  type CheatSheetFrame,
} from "@burn-ins/lib/cheat-sheet"
import {
  geometryOf,
  LANDSCAPE,
  PORTRAIT,
  type FrameSize,
} from "@burn-ins/lib/geometry"
import { isFitProblem } from "@burn-ins/lib/parsed"
import { describe, expect, it } from "vitest"

/** A card's params with the stamp the renderer gives every card. */
const stamped = (params: object): object => ({
  stamp: { sources: ["paulgsc/dotfiles@91cb11b"], date: "2026-11-13" },
  ...params,
})

const sheet = (
  params: object,
  frame: FrameSize = LANDSCAPE
): ReturnType<typeof prepare> =>
  prepare(
    { kind: "cheat-sheet", design: "sheet-v1", params: stamped(params) },
    frame
  )

const at = (
  params: object,
  t: number,
  frame: FrameSize = LANDSCAPE
): CheatSheetFrame => {
  const p = sheet(params, frame)
  if (!p.ok) throw new Error(p.problems.join("; "))
  const f = frameAt(p.value, t)
  if (f.kind !== "cheat-sheet") throw new Error(f.kind)
  return f.frame
}

/** The NixOS video's "By hand" sheet, as the prototype drew it. */
const BY_HAND = {
  kicker: "CHEAT SHEET · BY HAND",
  title: "When you want it now",
  rows: [
    {
      badge: "you",
      task: "Upgrade now",
      command: "sudo systemctl start nixos-upgrade",
      note: "Same path as the nightly run, report included.",
    },
    {
      badge: "main",
      task: "Watch it",
      command:
        "journalctl -fu nixos-upgrade -u home-manager-upgrade -u upgrade-report",
    },
    {
      badge: "main",
      task: "Read the verdict",
      command: "cat /var/lib/upgrade-report/latest.md",
    },
    {
      badge: "you",
      task: "New kernel",
      command: "reboot when you choose",
      note: "Nothing reboots on its own.",
    },
    {
      badge: "gap",
      task: "Reload tmux after a change",
      command: "tmux source-file ~/.config/tmux/tmux.conf",
      note: "prefix r reads ~/.tmux.conf, which home-manager does not write.",
    },
  ],
}

/**
 * The database essay's "What it survives" sheet, as paulgsc/testing's
 * `cards/home-database-safety-2026-11-21.json` gave it: five rows whose notes
 * take two lines, which one column of the 16:9 body can't hold (CHEAT).
 */
const SURVIVES = {
  kicker: "CHEAT SHEET · WHAT IT SURVIVES",
  title: "Five failures, and what home has for each",
  rows: [
    {
      badge: "main",
      task: "A migration that errors",
      command: "survives",
      note: "Exit, roll back the image, the earlier migrations stay. Nothing to restore.",
    },
    {
      badge: "you",
      task: "A file deleted by accident",
      command: "by hand",
      note: "Refused at the next start. The newest copy, less the writes since.",
    },
    {
      badge: "you",
      task: "A corrupt database file",
      command: "by hand",
      note: "The newest copy, as old as the last schema change.",
    },
    {
      badge: "gap",
      task: "A dead disk, a box that won't boot",
      command: "does not survive",
      note: "The copies share the disk. The phone and Drive keep their part.",
    },
    {
      badge: "you",
      task: "A new box",
      command: "by hand",
      note: "Dotfiles and the server repo; secrets open with your admin key.",
    },
  ],
}

/** The same essay's "Writes" sheet: five rows, a note of one line each. */
const WRITES = {
  kicker: "CHEAT SHEET · WRITES",
  title: "One writer, small writes, each whole or not at all",
  rows: [
    {
      badge: "main",
      task: "Readers and a writer",
      command: "WAL mode",
      note: "Many readers beside one writer; a lock waited on for up to 5 s.",
    },
    {
      badge: "main",
      task: "Connections",
      command: "at most 5",
      note: "None within 3 s: answered busy. Every request answered within 8 s.",
    },
    {
      badge: "main",
      task: "A write",
      command: "one transaction",
      note: "Whole or not at all; a crash leaves the database as it was.",
    },
    {
      badge: "main",
      task: "The record",
      command: "no update, no delete",
      note: "Triggers refuse both on most record tables.",
    },
    {
      badge: "main",
      task: "A power cut",
      command: "last commits may go",
      note: "The file stays consistent; the log checksums each frame.",
    },
  ],
}

const END = 60_000

const ROWS = (n: number): ReadonlyArray<object> =>
  Array.from({ length: n }, () => ({
    task: "A task",
    command: "do it",
    note: "A note under it.",
  }))

describe("the cheat-sheet card", () => {
  it("draws the NixOS sheet from its params, a row at a time, task beside command", () => {
    expect(at(BY_HAND, ITEM.leadMs - 1).rows).toEqual([])
    expect(at(BY_HAND, ITEM.leadMs + ITEM.gapMs).rows).toHaveLength(2)
    const rows = at(BY_HAND, END).rows
    expect(rows.map((r) => r.command.text)).toEqual(
      BY_HAND.rows.map((r) => r.command)
    )
    expect(rows.every((r) => r.command.x > r.task.box.x)).toBe(true)
    expect(
      rows.every((r) => r.command.y < r.task.box.y + r.task.box.height)
    ).toBe(true)
  })

  it("sets the task above the command where they don't fit side by side, and refuses a row that fits neither way", () => {
    const narrow = {
      title: "Narrow",
      rows: [
        {
          task: "Watch the upgrade",
          command: "journalctl -fu nixos-upgrade -u home-manager-upgrade",
        },
        { task: "Watch it", command: BY_HAND.rows[1]?.command ?? "" },
      ],
    }
    const p = sheet(narrow, PORTRAIT)
    expect(p.ok ? [] : p.problems).toEqual([
      "the cheat-sheet burn-in (sheet-v1): row 2 doesn't fit",
    ])
    const [row] = at(
      { ...narrow, rows: narrow.rows.slice(0, 1) },
      END,
      PORTRAIT
    ).rows
    expect(row?.command.x).toBe(row?.task.box.x)
    expect(row?.command.y).toBeGreaterThanOrEqual(
      (row?.task.box.y ?? 0) + (row?.task.box.height ?? 0)
    )
  })

  it("spells out each new state's badge on its first row, moving that row's words aside", () => {
    const t = ITEM.leadMs + 1300
    const [open] = at(BY_HAND, t).rows
    const [shut] = at({ ...BY_HAND, badgesSeen: ["you"] }, t).rows
    expect(open?.badge?.open?.amount).toBe(1)
    expect(shut?.badge?.open).toBeNull()
    expect(open?.task.box.x).toBeGreaterThan(shut?.task.box.x ?? Infinity)
  })

  it("refuses, naming the row, a value, a character its type lacks, and more rows than fit", () => {
    const p = sheet({
      title: "Wrong",
      rows: [
        { task: "Set the token", command: "export TOKEN=abc123" },
        { task: "Go", command: "a → b" },
      ],
    })
    expect(p.ok ? [] : p.problems).toEqual([
      "the cheat-sheet burn-in (sheet-v1): row 1 gives TOKEN a value; a card shows a placeholder, never a value",
      `the cheat-sheet burn-in (sheet-v1): row 2's command has "→", which the card's type can't draw`,
    ])
    // Neither is the frame's: what home holds as not fitting (CHEAT).
    expect(p.ok ? [] : p.problems.filter(isFitProblem)).toEqual([])
    expect(
      sheet({ title: "Crowded", rows: ROWS(MOST_ROWS + 1) }).ok,
      "more rows than the schema's bound"
    ).toBe(false)
  })

  it("sets the database essay's sheets in two columns of the 16:9 body, the first half on the left", () => {
    for (const params of [SURVIVES, WRITES]) {
      const rows = at(params, END).rows
      expect(rows.map((r) => r.command.text)).toEqual(
        params.rows.map((r) => r.command)
      )
      const [first, , third, fourth] = rows
      expect(third?.panel.x).toBe(first?.panel.x)
      expect(fourth?.panel.x).toBeGreaterThan(
        (first?.panel.x ?? 0) + (first?.panel.width ?? 0)
      )
      expect(fourth?.panel.y).toBe(first?.panel.y)
    }
    // In the 9:16 frame's taller body they run down one column.
    const tall = at(SURVIVES, END, PORTRAIT).rows
    expect(new Set(tall.map((r) => r.panel.x)).size).toBe(1)
  })

  it("refuses, by its number, a row of a two-column sheet whose command can't sit beside its task", () => {
    const long = {
      task: "Watch it",
      command: "journalctl -fu nixos-upgrade -u home-manager-upgrade",
      note: "A note under it, long enough to take a second line in a column.",
    }
    const p = sheet({
      title: "Long",
      rows: [...SURVIVES.rows.slice(0, 4), long],
    })
    expect(p.ok ? [] : p.problems).toEqual([
      "the cheat-sheet burn-in (sheet-v1): row 5 doesn't fit: 5 rows take two columns, and its command doesn't fit beside its task in one",
    ])
  })

  it("keeps every row above the stamp while it rises, for every sheet it accepts", () => {
    for (const frame of [LANDSCAPE, PORTRAIT]) {
      const body = cardBody(geometryOf(frame))
      let accepted = 0
      for (let n = 1; n <= MOST_ROWS; n++) {
        // Laid out once per sheet: each step only reads the frame at t (#3065).
        const prepared = sheet({ title: "Rows", rows: ROWS(n) }, frame)
        if (!prepared.ok) continue
        accepted += 1
        let lowest = { bottom: -Infinity, t: 0 }
        for (let t = 0; t <= END; t += 50) {
          const f = frameAt(prepared.value, t)
          if (f.kind !== "cheat-sheet") throw new Error(f.kind)
          for (const r of f.frame.rows)
            if (r.panel.y + r.panel.height > lowest.bottom)
              lowest = { bottom: r.panel.y + r.panel.height, t }
        }
        expect(
          lowest.bottom,
          `${frame.width}x${frame.height}, ${n} rows, at ${lowest.t} ms`
        ).toBeLessThanOrEqual(body.y + body.height)
      }
      expect(accepted).toBeGreaterThan(0)
    }
  })

  // CH1: a sheet of rows that each hold at every count in its frame
  // (`holdsAtEveryCount`) is drawn, at every count the schema allows, in
  // both frames. Rows of each length a row can be (task short to long;
  // command short, in the gap where a badge opening decides, or long; note
  // none, one line, two in the wide frame, or two only there), each badge or
  // none, new or already seen; every row alike, rows mixed from all, and
  // rows mixed from those CH1 covers. An accepted sheet keeps every row
  // inside the body and clear of the others at every moment of its rise.
  // A refusal names only rows CH1 doesn't cover (its Tolerance).
  // Cost: about 0.95 s idle and 5.6 s on a CI runner running every
  // package's tests at once (#3449's run), past vitest's 5 s default, so
  // the case carries a 30 s bound (BIT1).
  it("CH1: draws every sheet of rows that hold at every count, at every count and length the schema allows", () => {
    const LONG = "sudo systemctl start nixos-upgrade"
    const tasks = [
      "Go",
      "A file deleted by accident",
      "A dead disk, a box that won't boot",
      "A dead disk, a box that won't boot, and a new one with nothing on it yet at all",
    ]
    const commands = [
      "survives",
      "does not survive",
      "x".repeat(20),
      "nix flake update --commit",
      LONG,
    ]
    const notes = [
      "",
      "Triggers refuse both on most record tables.",
      "Exit, roll back the image, the earlier migrations stay. Nothing to restore, and nothing to say.",
      "Exit, roll back the image, the earlier migrations stay. Nothing to restore, and nothing to say. Exit, roll back the image, the earlier migrations stay. Nothing more.",
    ]
    const rows = tasks.flatMap((task) =>
      commands.flatMap((command) =>
        notes.flatMap((note) =>
          [undefined, ...BADGE_STATES].map((badge) =>
            badge === undefined
              ? { task, command, note }
              : { task, command, note, badge }
          )
        )
      )
    )
    type Row = (typeof rows)[number]
    const named = /^the cheat-sheet burn-in \(sheet-v1\): row (\d+) /
    for (const frame of [LANDSCAPE, PORTRAIT]) {
      const g = geometryOf(frame)
      const holds = (r: Row): boolean =>
        holdsAtEveryCount({ ...r, atMs: undefined }, g)
      const covered = rows.filter(holds)
      // Both kinds are tried in each frame, or the property proves nothing.
      expect(covered.length, `${frame.width}`).toBeGreaterThan(0)
      expect(covered.length, `${frame.width}`).toBeLessThan(rows.length)
      const pick = (from: ReadonlyArray<Row>, k: number): Row =>
        from[k % from.length] ?? rows[0]!
      const sheets = (n: number): ReadonlyArray<ReadonlyArray<Row>> =>
        Array.from({ length: 24 }, (_, k) => [
          Array.from({ length: n }, () => pick(rows, k * 11)),
          Array.from({ length: n }, (_, i) => pick(rows, k * 11 + 37 * i)),
          Array.from({ length: n }, (_, i) => pick(covered, k * 5 + 13 * i)),
        ]).flat()
      const body = cardBody(g)
      for (let n = 1; n <= MOST_ROWS; n++)
        for (const sheetRows of sheets(n))
          for (const badgesSeen of [[], [...BADGE_STATES]]) {
            const params = { title: "Rows", badgesSeen, rows: sheetRows }
            const where = `${frame.width}x${frame.height}, ${n} rows, seen ${badgesSeen.length}: ${JSON.stringify(sheetRows)}`
            const p = sheet(params, frame)
            if (!p.ok) {
              expect(
                sheetRows.every(holds),
                `${where}: ${p.problems.join("; ")}`
              ).toBe(false)
              for (const problem of p.problems) {
                expect(isFitProblem(problem), where).toBe(true)
                const row = Number(named.exec(problem)?.[1] ?? 0)
                const r = sheetRows[row - 1]
                expect(
                  r !== undefined && !holds(r),
                  `${where}: ${problem}`
                ).toBe(true)
              }
              continue
            }
            expect(at(params, END, frame).rows, where).toHaveLength(n)
            // A row is lowest as its rise begins: check each row's first
            // moment, and the end.
            const moments = [
              ...Array.from(
                { length: n },
                (_, k) => ITEM.leadMs + k * ITEM.gapMs
              ),
              END,
            ]
            for (const t of moments) {
              const f = frameAt(p.value, t)
              if (f.kind !== "cheat-sheet") throw new Error(f.kind)
              const panels = f.frame.rows.map((r) => r.panel)
              for (const [k, a] of panels.entries()) {
                expect(
                  a.x >= body.x &&
                    a.x + a.width <= body.x + body.width &&
                    a.y >= body.y &&
                    a.y + a.height <= body.y + body.height,
                  `${where}, at ${t} ms`
                ).toBe(true)
                for (const b of panels.slice(k + 1))
                  expect(
                    a.x + a.width <= b.x ||
                      b.x + b.width <= a.x ||
                      a.y + a.height <= b.y ||
                      b.y + b.height <= a.y,
                    `${where}, at ${t} ms: rows overlap`
                  ).toBe(true)
              }
            }
          }
    }
  }, 30_000)

  it("CH1's Tolerance: a long command draws while its sheet fits one column of the 16:9 body, and is refused by its number once it takes two", () => {
    const row = {
      task: "Go",
      command: "sudo systemctl start nixos-upgrade",
      note: "Exit, roll back the image, the earlier migrations stay. Nothing to restore, and nothing to say.",
    }
    const one = sheet({ title: "Long", rows: [row, row, row] })
    expect(one.ok).toBe(true)
    const two = sheet({
      title: "Long",
      rows: Array.from({ length: 5 }, () => row),
    })
    expect(two.ok ? [] : two.problems).toEqual(
      [1, 2, 3, 4, 5].map(
        (i) =>
          `the cheat-sheet burn-in (sheet-v1): row ${i} doesn't fit: 5 rows take two columns, and its command doesn't fit beside its task in one`
      )
    )
  })
})
