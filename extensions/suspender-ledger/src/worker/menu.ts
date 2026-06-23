// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Ported from auto-tab-discard v3/worker/menu.mjs (MPL-2.0)
// Copyright (C) auto-tab-discard contributors

import { discard, inprogress } from "./core/discard"
import { isMoveCommand, navigate } from "./core/navigate"
import { prefs, storage } from "./core/prefs"
import { starters } from "./core/startup"
import { match, notify, query } from "./core/utils"
import { number } from "./modes/number"

/**
 * Context menu, keyboard command, and toolbar action wiring.
 *
 * Port notes:
 *   - The `plugins/loader` (`interrupts`) hook is out of scope and dropped.
 *   - The Tree Style Tab sidebar branch (external messaging protocol) is
 *     dropped; native tab-group / highlighted handling is kept.
 *   - `localStorage` is unavailable in an MV3 background context, so the
 *     toolbar-click fallback action defaults to discarding the active tab.
 *   - No `chrome.tabs.remove` / `close` navigation — the never-close invariant.
 */

/** Click payload — superset of `OnClickData` plus the fields the worker
 *  synthesizes when dispatching menu actions from the popup/commands. */
type ClickInfo = {
  menuItemId: string | number
  shiftKey?: boolean
  checked?: boolean
  value?: boolean
  linkUrl?: string
}

{
  const onStartup = (): void => {
    const contexts: Array<chrome.contextMenus.ContextType> = ["action"]
    if (prefs["tab.context"]) {
      // "tab" is a Firefox-only context absent from the chrome typings
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      contexts.push("tab" as chrome.contextMenus.ContextType)
    }
    if (prefs["page.context"]) {
      contexts.push("page")
    }

    const create = (arr: Array<chrome.contextMenus.CreateProperties>): void => {
      chrome.contextMenus.removeAll(() => {
        arr.forEach((o) => chrome.contextMenus.create(o))
      })
    }

    const items: Array<chrome.contextMenus.CreateProperties | null> = [
      {
        id: "discard-tab",
        title: chrome.i18n.getMessage("menu_discard_tab") || "Suspend tab",
        contexts,
        documentUrlPatterns: ["*://*/*"],
      },
      {
        id: "discard-tree",
        title:
          chrome.i18n.getMessage("menu_discard_tree") || "Suspend tab tree",
        contexts,
        documentUrlPatterns: ["*://*/*"],
      },
      {
        id: "discard-other-windows",
        title:
          chrome.i18n.getMessage("menu_discard_other_windows") ||
          "Suspend other windows",
        contexts,
      },
      {
        id: "discard-sub-menu",
        title: chrome.i18n.getMessage("menu_discard_menu") || "Suspend",
        contexts,
      },
      {
        id: "discard-tabs",
        title:
          chrome.i18n.getMessage("menu_discard_tabs") || "Suspend all tabs",
        contexts,
      },
      {
        id: "discard-window",
        title:
          chrome.i18n.getMessage("menu_discard_window") ||
          "Suspend this window",
        contexts,
        parentId: "discard-sub-menu",
      },
      {
        id: "discard-rights",
        title:
          chrome.i18n.getMessage("menu_discard_rights") ||
          "Suspend tabs to the right",
        contexts,
        parentId: "discard-sub-menu",
      },
      {
        id: "discard-lefts",
        title:
          chrome.i18n.getMessage("menu_discard_lefts") ||
          "Suspend tabs to the left",
        contexts,
        parentId: "discard-sub-menu",
      },
      {
        id: "extra",
        title: chrome.i18n.getMessage("menu_extra") || "Extra",
        contexts,
        documentUrlPatterns: ["*://*/*"],
      },
      {
        id: "auto-discardable",
        title: chrome.i18n.getMessage("popup_allowed") || "Auto-suspendable",
        contexts,
        documentUrlPatterns: ["*://*/*"],
        parentId: "extra",
      },
      {
        id: "whitelist-domain",
        title:
          chrome.i18n.getMessage("menu_whitelist_domain") || "Whitelist domain",
        contexts,
        documentUrlPatterns: ["*://*/*"],
        parentId: "extra",
      },
      prefs["link.context"]
        ? {
            id: "open-tab-then-discard",
            title:
              chrome.i18n.getMessage("menu_open_tab_then_discard") ||
              "Open link in a suspended tab",
            contexts: ["link"],
            documentUrlPatterns: ["*://*/*"],
          }
        : null,
    ]
    create(
      items.filter((o): o is chrome.contextMenus.CreateProperties => o !== null)
    )
  }
  starters.push(onStartup)

  const onClicked = async (
    info: ClickInfo,
    tab?: chrome.tabs.Tab
  ): Promise<void> => {
    if (!tab) {
      return
    }
    const menuItemId = String(info.menuItemId)
    const { shiftKey, checked } = info

    if (
      menuItemId === "whitelist-domain" ||
      menuItemId === "whitelist-session"
    ) {
      const base = await storage(prefs)
      const session = await storage<{ "whitelist.session": Array<string> }>(
        { "whitelist.session": [] },
        "session"
      )
      const merged = { ...base, ...session }

      const d = menuItemId !== "whitelist-session"
      if (!tab.url) {
        return
      }
      const { hostname, protocol = "" } = new URL(tab.url)

      let rule: string
      if (protocol.startsWith("http") || protocol.startsWith("ftp")) {
        let whitelist = merged[d ? "whitelist" : "whitelist.session"]

        if (shiftKey) {
          rule = `re:^${tab.url.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}$`
        } else {
          rule = hostname
        }

        if (checked === false) {
          whitelist = whitelist.filter(
            (r) => !match([r], hostname, tab.url ?? "")
          )
        } else {
          whitelist.push(rule)
        }
        whitelist = whitelist.filter((h, i, l) => l.indexOf(h) === i)

        const check = (): Promise<void> =>
          number.check(
            [],
            { "exclude-active": false, "icon-update": true },
            "menu/1"
          )

        if (d) {
          chrome.storage.local.set({ whitelist }, () => {
            void check()
          })
        } else {
          chrome.storage.session.set({ "whitelist.session": whitelist }, () => {
            void check()
          })
        }
      } else {
        notify(`"${protocol}" ${chrome.i18n.getMessage("menu_msg2")}`)
      }
    } else if (menuItemId === "discard-tab" || menuItemId === "discard-tree") {
      const tabs = await query({ windowId: tab.windowId })
      const htabs: Array<chrome.tabs.Tab> = []

      if (tab.highlighted && menuItemId === "discard-tree") {
        const tbs = tabs.filter((t) => t.highlighted)
        if (tbs.length > 1) {
          htabs.push(...tbs)
        } else if (tab.groupId > -1) {
          htabs.push(...tabs.filter((t) => t.groupId === tab.groupId))
        } else {
          htabs.push(tab)
        }
      } else {
        htabs.push(tab)
      }

      if (htabs.filter((t) => t.active).length) {
        const ids = htabs.map((t) => t.id)
        const otab = tabs
          .filter(
            (t) =>
              t.discarded === false &&
              t.highlighted === false &&
              t.status !== "unloaded" &&
              ids.indexOf(t.id) === -1 &&
              (t.id === undefined || inprogress.has(t.id) === false)
          )
          .sort(
            (a, b) =>
              Math.abs(a.index - tab.index) - Math.abs(b.index - tab.index)
          )
          .shift()

        if (otab?.id !== undefined) {
          chrome.tabs.update(otab.id, { active: true }, () => {
            // one tab was active when htabs was recorded; mark it inactive
            htabs.forEach((t) => (t.active = false))
            htabs.forEach((t) => {
              void discard(t)
            })
          })
        } else {
          notify(chrome.i18n.getMessage("menu_msg3") || "No tab to switch to")
        }
      } else {
        htabs.forEach((t) => {
          void discard(t)
        })
      }
    } else if (menuItemId === "open-tab-then-discard") {
      if (info.linkUrl) {
        // Firefox can create a tab in the discarded state directly; the `browser`
        // namespace models the Firefox-only `discarded` CreateProperties field.
        void browser.tabs.create({
          active: false,
          url: info.linkUrl,
          discarded: true,
        })
      }
    } else if (menuItemId === "auto-discardable") {
      if (tab.id !== undefined) {
        void chrome.tabs.update(tab.id, {
          autoDiscardable: info.value || false,
        })
      }
    } else if (menuItemId === "toggle-allowed") {
      void chrome.tabs.update({
        autoDiscardable: tab.autoDiscardable === false,
      })
    } else {
      // discard-tabs, discard-window, discard-other-windows, discard-rights,
      // discard-lefts and the matching release-* variants
      const qinfo: chrome.tabs.QueryInfo = {
        url: "*://*/*",
        discarded: menuItemId.startsWith("release"),
        active: false,
      }
      if (
        [
          "discard-window",
          "discard-rights",
          "discard-lefts",
          "release-window",
          "release-rights",
          "release-lefts",
        ].some((k) => k === menuItemId)
      ) {
        qinfo.currentWindow = true
      } else if (
        menuItemId === "discard-other-windows" ||
        menuItemId === "release-other-windows"
      ) {
        qinfo.currentWindow = false
      }
      let tabs = await query(qinfo)

      if (menuItemId.endsWith("rights") || menuItemId.endsWith("lefts")) {
        if (menuItemId.endsWith("lefts")) {
          tabs = tabs.filter((t) => t.index < tab.index)
        } else {
          tabs = tabs.filter((t) => t.index > tab.index)
        }
      }
      if (menuItemId.startsWith("discard")) {
        if (shiftKey) {
          tabs.forEach((t) => {
            void discard(t)
          })
        } else {
          // only discard the eligible tabs, not all of them
          void number.check(tabs, number.IGNORE, "menu/2")
        }
      } else {
        // release: reload the discarded tabs
        for (const t of tabs) {
          if (t.id !== undefined) {
            void chrome.tabs.reload(t.id, { bypassCache: shiftKey === true })
          }
        }
      }
    }
  }

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    void onClicked(info, tab)
  })
  // Toolbar click fallback when the popup is disabled: suspend the active tab.
  chrome.action.onClicked.addListener((tab) => {
    void onClicked({ menuItemId: "discard-tab" }, tab)
  })

  // keyboard commands (move-* navigation + discard actions); never `close`
  const handleCommand = async (command: string): Promise<void> => {
    if (isMoveCommand(command)) {
      void navigate(command)
    } else {
      const tabs = await query({ active: true, currentWindow: true })
      if (tabs.length && tabs[0]) {
        void onClicked({ menuItemId: command }, tabs[0])
      }
    }
  }
  chrome.commands.onCommand.addListener((command) => {
    void handleCommand(command)
  })

  chrome.runtime.onMessage.addListener((request, sender) => {
    if (request.method === "popup") {
      void query({ active: true, currentWindow: true }).then((tabs) => {
        if (tabs.length && tabs[0]) {
          void onClicked(
            {
              menuItemId: request.cmd,
              value: request.value,
              checked: request.checked,
              shiftKey: request.shiftKey,
            },
            tabs[0]
          )
        }
      })
    } else if (request.method === "simulate") {
      void onClicked({ menuItemId: request.cmd }, sender.tab)
    } else if (request.method === "build-context") {
      onStartup()
    } else if (request.method === "run-check-on-action") {
      const ids: Array<number> = request.ids
      void number.check(
        ids.map((id) => ({ id })),
        { "exclude-active": false, "icon-update": true },
        "menu/3"
      )
    }
  })
}
