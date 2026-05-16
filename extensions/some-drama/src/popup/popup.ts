// Watchlist manager popup.
//
// Opens when the user clicks the extension icon on the VIDEO tab (or any tab).
// Typestate FSM:
//   LOADING    — awaiting GET_STATE + current tab info
//   IDLE       — list view; shows watchlist, active toggle, scrape button
//   SCRAPING   — heuristic running on current tab
//   FORM       — add/edit entry form (pre-filled from scrape or blank)
//   SAVING     — UPSERT_ENTRY in flight
//   ERROR      — any async failure, with retry
//
// The popup is 340px wide (Firefox popup constraint).
// Aesthetic: matches the card's dark editorial palette.

import "@drama/styles/popup.css"

// ─── Types ────────────────────────────────────────────────────────────────────

type DramaEntry = {
  id: string
  title: string
  episode: string
  network: string
  year: string
  genre: string
  note: string
  color: string
  addedAt: number
}

type WatchlistState = {
  watchlist: Array<DramaEntry>
  activeId: string | null
}

type ScrapedMeta = {
  title: string
  episode: string
  network: string
  url: string
}

type PopupPhase =
  | { tag: "LOADING" }
  | { tag: "IDLE"; state: WatchlistState; tabId: number; isVideoTab: boolean }
  | { tag: "SCRAPING"; state: WatchlistState; tabId: number }
  | {
      tag: "FORM"
      state: WatchlistState
      tabId: number
      prefill: Partial<DramaEntry>
      editId?: string
    }
  | { tag: "SAVING"; state: WatchlistState; tabId: number }
  | { tag: "ERROR"; message: string; prev: PopupPhase }

// ─── Constants ────────────────────────────────────────────────────────────────

const VIDEO_HOSTS = [
  "youtube.com",
  "netflix.com",
  "viki.com",
  "disneyplus.com",
  "hulu.com",
  "twitch.tv",
  "primevideo.com",
  "crunchyroll.com",
  "wetv.vip",
  "weverse.io",
]

const MAX_WATCHLIST = 5

const ACCENT_COLORS = [
  "#ff6b6b",
  "#f97316",
  "#facc15",
  "#4ade80",
  "#22d3ee",
  "#818cf8",
  "#e879f9",
  "#fb7185",
]

function isVideoHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "")
    return VIDEO_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
  } catch {
    return false
  }
}

// ─── DOM helpers ─────────────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  return e
}

// ─── Messaging ────────────────────────────────────────────────────────────────

async function sendMsg<T>(msg: unknown): Promise<T> {
  return browser.runtime.sendMessage(msg) as Promise<T>
}

// ─── Main FSM ─────────────────────────────────────────────────────────────────

class PopupApp {
  private root: HTMLElement
  private phase: PopupPhase = { tag: "LOADING" }

  constructor(root: HTMLElement) {
    this.root = root
    void this.boot()
  }

  private async boot(): Promise<void> {
    this.render()

    try {
      const [stateResp, tabs] = await Promise.all([
        sendMsg<{ ok: boolean; state: WatchlistState }>({ type: "GET_STATE" }),
        browser.tabs.query({ active: true, currentWindow: true }),
      ])

      const tab = tabs[0]
      const tabId = tab?.id ?? -1
      const tabUrl = tab?.url ?? ""
      const isVideoTab = isVideoHost(tabUrl)

      if (!stateResp.ok) throw new Error("Failed to load state")

      this.transition({
        tag: "IDLE",
        state: stateResp.state,
        tabId,
        isVideoTab,
      })
    } catch (err) {
      this.transition({ tag: "ERROR", message: String(err), prev: this.phase })
    }
  }

  private transition(next: PopupPhase): void {
    this.phase = next
    this.render()
  }

  private render(): void {
    this.root.innerHTML = ""

    // Header always visible
    const header = this.buildHeader()
    this.root.appendChild(header)

    const body = el("div", "p-body")
    this.root.appendChild(body)

    switch (this.phase.tag) {
      case "LOADING":
        body.appendChild(this.renderLoading())
        break
      case "IDLE":
        body.appendChild(this.renderIdle(this.phase))
        break
      case "SCRAPING":
        body.appendChild(this.renderScraping())
        break
      case "FORM":
        body.appendChild(this.renderForm(this.phase))
        break
      case "SAVING":
        body.appendChild(this.renderSaving())
        break
      case "ERROR":
        body.appendChild(this.renderError(this.phase))
        break
    }
  }

  // ── Header ─────────────────────────────────────────────────────────────────

  private buildHeader(): HTMLElement {
    const h = el("header", "p-header")
    const title = el("div", "p-header-title")
    title.appendChild(el("span", "p-header-dot"))
    const t = el("span")
    t.textContent = "Drama Overlay"
    title.appendChild(t)
    h.appendChild(title)

    if (this.phase.tag === "IDLE") {
      const phase = this.phase
      const addBtn = el("button", "p-btn p-btn-sm p-btn-primary")
      addBtn.textContent = "+"
      addBtn.title = "Add drama"
      addBtn.disabled = phase.state.watchlist.length >= MAX_WATCHLIST
      addBtn.addEventListener("click", () => {
        this.transition({
          tag: "FORM",
          state: phase.state,
          tabId: phase.tabId,
          prefill: {},
        })
      })
      h.appendChild(addBtn)
    }

    return h
  }

  // ── LOADING ────────────────────────────────────────────────────────────────

  private renderLoading(): HTMLElement {
    const wrap = el("div", "p-center")
    const spinner = el("div", "p-spinner")
    wrap.appendChild(spinner)
    const t = el("div", "p-muted")
    t.textContent = "Loading…"
    wrap.appendChild(t)
    return wrap
  }

  // ── IDLE ───────────────────────────────────────────────────────────────────

  private renderIdle(phase: Extract<PopupPhase, { tag: "IDLE" }>): HTMLElement {
    const { state, tabId, isVideoTab } = phase
    const wrap = el("div", "p-idle")

    // Context banner
    const banner = el(
      "div",
      isVideoTab ? "p-banner p-banner-video" : "p-banner p-banner-other"
    )
    banner.textContent = isVideoTab
      ? "📺  Video tab detected — scrape meta or enter manually"
      : "🖥️  Non-video tab — you can still manage your watchlist"
    wrap.appendChild(banner)

    // Scrape button (only meaningful on video tab)
    if (isVideoTab) {
      const scrapeBtn = el("button", "p-btn p-btn-block p-btn-ghost")
      scrapeBtn.textContent = "⟳  Auto-fill from page"
      scrapeBtn.addEventListener("click", () => this.doScrape(state, tabId))
      wrap.appendChild(scrapeBtn)
    }

    // Watchlist
    if (state.watchlist.length === 0) {
      const empty = el("div", "p-empty")
      empty.innerHTML = `<span class="p-empty-icon">🎬</span><br/>No dramas yet.<br/>
        <span class="p-muted">${isVideoTab ? "Scrape or add manually." : "Open popup on a video tab to add."}</span>`
      wrap.appendChild(empty)
    } else {
      const list = el("div", "p-list")
      for (const entry of state.watchlist) {
        list.appendChild(this.renderEntry(entry, state, tabId))
      }
      wrap.appendChild(list)
    }

    // Capacity indicator
    const cap = el("div", "p-capacity")
    cap.textContent = `${state.watchlist.length} / ${MAX_WATCHLIST} dramas`
    wrap.appendChild(cap)

    return wrap
  }

  private renderEntry(
    entry: DramaEntry,
    state: WatchlistState,
    tabId: number
  ): HTMLElement {
    const isActive = entry.id === state.activeId
    const row = el("div", `p-entry${isActive ? " p-entry-active" : ""}`)

    // Color swatch
    const swatch = el("div", "p-swatch")
    swatch.style.background = entry.color || ACCENT_COLORS[0]
    row.appendChild(swatch)

    // Info
    const info = el("div", "p-entry-info")
    const titleEl = el("div", "p-entry-title")
    titleEl.textContent = entry.title
    info.appendChild(titleEl)

    const meta = el("div", "p-entry-meta")
    meta.textContent = [entry.episode, entry.network, entry.year]
      .filter(Boolean)
      .join("  ·  ")
    info.appendChild(meta)
    row.appendChild(info)

    // Actions
    const actions = el("div", "p-entry-actions")

    // Active toggle
    const activeBtn = el(
      "button",
      `p-btn p-btn-icon${isActive ? " p-btn-active" : ""}`
    )
    activeBtn.title = isActive ? "Currently displaying" : "Set as active"
    activeBtn.textContent = isActive ? "◉" : "○"
    activeBtn.addEventListener("click", () => this.doSetActive(entry.id, tabId))
    actions.appendChild(activeBtn)

    // Edit
    const editBtn = el("button", "p-btn p-btn-icon")
    editBtn.title = "Edit"
    editBtn.textContent = "✎"
    editBtn.addEventListener("click", () => {
      this.transition({
        tag: "FORM",
        state,
        tabId,
        prefill: { ...entry },
        editId: entry.id,
      })
    })
    actions.appendChild(editBtn)

    // Remove
    const removeBtn = el("button", "p-btn p-btn-icon p-btn-danger")
    removeBtn.title = "Remove"
    removeBtn.textContent = "✕"
    removeBtn.addEventListener("click", () => this.doRemove(entry.id, tabId))
    actions.appendChild(removeBtn)

    row.appendChild(actions)
    return row
  }

  // ── SCRAPING ───────────────────────────────────────────────────────────────

  private renderScraping(): HTMLElement {
    const wrap = el("div", "p-center")
    const spinner = el("div", "p-spinner")
    wrap.appendChild(spinner)
    const t = el("div", "p-muted")
    t.textContent = "Reading page metadata…"
    wrap.appendChild(t)
    return wrap
  }

  private async doScrape(state: WatchlistState, tabId: number): Promise<void> {
    this.transition({ tag: "SCRAPING", state, tabId })
    try {
      const resp = await sendMsg<{
        ok: boolean
        data: ScrapedMeta | null
        error?: string
      }>({
        type: "SCRAPE_TAB",
        tabId,
      })
      const prefill: Partial<DramaEntry> =
        resp.ok && resp.data
          ? {
              title: resp.data.title,
              episode: resp.data.episode,
              network: resp.data.network,
            }
          : {}
      this.transition({ tag: "FORM", state, tabId, prefill })
    } catch (err) {
      // Scrape failed — fall through to blank form with error note
      this.transition({
        tag: "FORM",
        state,
        tabId,
        prefill: { note: `Scrape failed: ${String(err)}` },
      })
    }
  }

  // ── FORM ───────────────────────────────────────────────────────────────────

  private renderForm(phase: Extract<PopupPhase, { tag: "FORM" }>): HTMLElement {
    const { state, tabId, prefill, editId } = phase
    const isEdit = Boolean(editId)

    const wrap = el("div", "p-form")

    const heading = el("div", "p-form-heading")
    heading.textContent = isEdit ? "Edit drama" : "Add drama"
    wrap.appendChild(heading)

    // Field builder
    const field = (
      label: string,
      name: string,
      value = "",
      placeholder = ""
    ): HTMLElement => {
      const group = el("div", "p-field")
      const lbl = el("label", "p-label")
      lbl.textContent = label
      lbl.htmlFor = `pf-${name}`
      group.appendChild(lbl)
      const inp = el("input", "p-input")
      inp.id = `pf-${name}`
      inp.name = name
      inp.value = value
      inp.placeholder = placeholder
      group.appendChild(inp)
      return group
    }

    wrap.appendChild(
      field("Title *", "title", prefill.title ?? "", "e.g. Queen of Tears")
    )
    wrap.appendChild(
      field("Episode", "episode", prefill.episode ?? "", "e.g. Ep 12")
    )
    wrap.appendChild(
      field("Network", "network", prefill.network ?? "", "e.g. tvN")
    )
    wrap.appendChild(field("Year", "year", prefill.year ?? "", "e.g. 2024"))
    wrap.appendChild(
      field("Genre", "genre", prefill.genre ?? "", "e.g. Romantic comedy")
    )
    wrap.appendChild(
      field("Note", "note", prefill.note ?? "", "Anything you want to remember")
    )

    // Color picker row
    const colorGroup = el("div", "p-field")
    const colorLbl = el("label", "p-label")
    colorLbl.textContent = "Accent color"
    colorGroup.appendChild(colorLbl)
    const colorRow = el("div", "p-color-row")
    let selectedColor = prefill.color || ACCENT_COLORS[0]

    for (const c of ACCENT_COLORS) {
      const swatch = el(
        "button",
        `p-color-swatch${c === selectedColor ? " p-color-selected" : ""}`
      )
      swatch.style.background = c
      swatch.title = c
      swatch.addEventListener("click", () => {
        selectedColor = c
        colorRow
          .querySelectorAll(".p-color-swatch")
          .forEach((s) => s.classList.toggle("p-color-selected", s === swatch))
      })
      colorRow.appendChild(swatch)
    }
    colorGroup.appendChild(colorRow)
    wrap.appendChild(colorGroup)

    // Buttons
    const btnRow = el("div", "p-btn-row")

    const cancelBtn = el("button", "p-btn p-btn-ghost")
    cancelBtn.textContent = "Cancel"
    cancelBtn.addEventListener("click", () => {
      this.transition({
        tag: "IDLE",
        state,
        tabId,
        isVideoTab: isVideoHost(state.watchlist[0]?.network ?? ""),
      })
      // Re-boot to get correct isVideoTab
      void this.bootToIdle(tabId)
    })
    btnRow.appendChild(cancelBtn)

    const saveBtn = el("button", "p-btn p-btn-primary")
    saveBtn.textContent = isEdit ? "Save changes" : "Add to watchlist"
    saveBtn.addEventListener("click", () => {
      const title = (
        wrap.querySelector("#pf-title") as HTMLInputElement
      )?.value?.trim()
      if (!title) {
        const inp = wrap.querySelector("#pf-title") as HTMLInputElement
        inp.classList.add("p-input-error")
        inp.focus()
        return
      }

      const entry: Partial<DramaEntry> & { title: string } = {
        id: editId,
        title,
        episode: (
          wrap.querySelector("#pf-episode") as HTMLInputElement
        )?.value?.trim(),
        network: (
          wrap.querySelector("#pf-network") as HTMLInputElement
        )?.value?.trim(),
        year: (
          wrap.querySelector("#pf-year") as HTMLInputElement
        )?.value?.trim(),
        genre: (
          wrap.querySelector("#pf-genre") as HTMLInputElement
        )?.value?.trim(),
        note: (
          wrap.querySelector("#pf-note") as HTMLInputElement
        )?.value?.trim(),
        color: selectedColor,
      }

      void this.doSave(entry, state, tabId)
    })
    btnRow.appendChild(saveBtn)
    wrap.appendChild(btnRow)

    return wrap
  }

  private async bootToIdle(tabId: number): Promise<void> {
    try {
      const stateResp = await sendMsg<{ ok: boolean; state: WatchlistState }>({
        type: "GET_STATE",
      })
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      })
      const url = tabs[0]?.url ?? ""
      this.transition({
        tag: "IDLE",
        state: stateResp.state,
        tabId,
        isVideoTab: isVideoHost(url),
      })
    } catch (err) {
      this.transition({ tag: "ERROR", message: String(err), prev: this.phase })
    }
  }

  // ── SAVING ─────────────────────────────────────────────────────────────────

  private renderSaving(): HTMLElement {
    const wrap = el("div", "p-center")
    wrap.appendChild(el("div", "p-spinner"))
    const t = el("div", "p-muted")
    t.textContent = "Saving…"
    wrap.appendChild(t)
    return wrap
  }

  private async doSave(
    entry: Partial<DramaEntry> & { title: string },
    state: WatchlistState,
    tabId: number
  ): Promise<void> {
    this.transition({ tag: "SAVING", state, tabId })
    try {
      const resp = await sendMsg<{
        ok: boolean
        state: WatchlistState
        error?: string
      }>({
        type: "UPSERT_ENTRY",
        entry,
      })
      if (!resp.ok) throw new Error(resp.error ?? "Unknown error")
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      })
      const url = tabs[0]?.url ?? ""
      this.transition({
        tag: "IDLE",
        state: resp.state,
        tabId,
        isVideoTab: isVideoHost(url),
      })
    } catch (err) {
      this.transition({ tag: "ERROR", message: String(err), prev: this.phase })
    }
  }

  // ── Set active ─────────────────────────────────────────────────────────────

  private async doSetActive(id: string, tabId: number): Promise<void> {
    try {
      const resp = await sendMsg<{ ok: boolean; state: WatchlistState }>({
        type: "SET_ACTIVE",
        id,
      })
      if (resp.ok) {
        const tabs = await browser.tabs.query({
          active: true,
          currentWindow: true,
        })
        const url = tabs[0]?.url ?? ""
        this.transition({
          tag: "IDLE",
          state: resp.state,
          tabId,
          isVideoTab: isVideoHost(url),
        })
      }
    } catch (err) {
      this.transition({ tag: "ERROR", message: String(err), prev: this.phase })
    }
  }

  // ── Remove ─────────────────────────────────────────────────────────────────

  private async doRemove(id: string, tabId: number): Promise<void> {
    try {
      const resp = await sendMsg<{ ok: boolean; state: WatchlistState }>({
        type: "REMOVE_ENTRY",
        id,
      })
      if (resp.ok) {
        const tabs = await browser.tabs.query({
          active: true,
          currentWindow: true,
        })
        const url = tabs[0]?.url ?? ""
        this.transition({
          tag: "IDLE",
          state: resp.state,
          tabId,
          isVideoTab: isVideoHost(url),
        })
      }
    } catch (err) {
      this.transition({ tag: "ERROR", message: String(err), prev: this.phase })
    }
  }

  // ── ERROR ──────────────────────────────────────────────────────────────────

  private renderError(
    phase: Extract<PopupPhase, { tag: "ERROR" }>
  ): HTMLElement {
    const wrap = el("div", "p-error-state")
    const icon = el("div", "p-error-icon")
    icon.textContent = "⚠"
    wrap.appendChild(icon)
    const msg = el("div", "p-error-msg")
    msg.textContent = phase.message
    wrap.appendChild(msg)
    const retryBtn = el("button", "p-btn p-btn-ghost")
    retryBtn.textContent = "Retry"
    retryBtn.addEventListener("click", () => void this.boot())
    wrap.appendChild(retryBtn)
    return wrap
  }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("popup-root")
  if (root) new PopupApp(root)
})
