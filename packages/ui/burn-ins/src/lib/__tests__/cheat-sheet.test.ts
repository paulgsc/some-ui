/** @vitest-environment node */
import { frameAt, prepare } from "@burn-ins/lib/burn-in"
import { ITEM } from "@burn-ins/lib/cards"
import type { CheatSheetFrame } from "@burn-ins/lib/cheat-sheet"
import { LANDSCAPE, PORTRAIT, type FrameSize } from "@burn-ins/lib/geometry"
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

const END = 60_000

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
    const crowded = sheet({
      title: "Crowded",
      rows: Array.from({ length: 8 }, () => ({
        task: "A task",
        command: "do it",
        note: "A note under it.",
      })),
    })
    expect(crowded.ok ? [] : crowded.problems).toEqual([
      "the cheat-sheet burn-in (sheet-v1): 8 rows don't fit",
    ])
  })
})
