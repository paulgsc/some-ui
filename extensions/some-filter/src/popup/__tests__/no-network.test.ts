/**
 * The extension makes no network requests (`amo-notes.md`). The popup is the
 * one page that ever made any: a remote font stylesheet, and every open tab's
 * favicon fetched from that tab's host.
 */

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { TabList } from "@filter/popup/components/tablist"
import type { TabEntry } from "@filter/types/popup"
import { describe, expect, it } from "vitest"

const ROOT = join(import.meta.dirname, "../../..")

function files(dir: string, ext: RegExp): Array<string> {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => ext.test(f))
    .map((f) => join(dir, f))
}

function tab(id: number, favIconUrl: string): TabEntry {
  return {
    id,
    windowId: 1,
    title: `Tab ${id}`,
    url: `https://example.com/${id}`,
    favIconUrl,
    active: false,
    audible: false,
    pinned: false,
    status: "complete",
  }
}

describe("no network requests", () => {
  it("ships no stylesheet or page that loads a remote resource", () => {
    const shipped = [
      ...files(join(ROOT, "src"), /\.(css|html)$/),
      ...files(join(ROOT, "public"), /\.(css|html)$/),
      ...files(ROOT, /^[^/]+\.html$/),
    ]
    expect(
      shipped.length,
      "precondition: found the popup's CSS"
    ).toBeGreaterThan(0)
    for (const file of shipped) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(
        /(@import\s+["']|url\(\s*["']?|(?:src|href)=["'])(https?:)?\/\//i
      )
    }
  })

  it("shows a tab's favicon only when it is inline, never fetching it", () => {
    const list = TabList({
      groups: [
        {
          windowId: 1,
          windowIndex: 0,
          tabs: [
            tab(1, "https://example.com/favicon.ico"),
            tab(2, "data:image/png;base64,iVBORw0KGgo="),
          ],
        },
      ],
      selectedTabIds: new Set(),
      filteredTabIds: new Set(),
      onTabToggle: () => undefined,
      onWindowSelectAll: () => undefined,
      onWindowDeselect: () => undefined,
      WindowGroupHeader: () => document.createElement("div"),
    })
    expect([...list.querySelectorAll("img")].map((img) => img.src)).toEqual([
      "data:image/png;base64,iVBORw0KGgo=",
    ])
  })
})
