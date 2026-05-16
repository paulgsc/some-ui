
/**
 *
 * Popup renderer. Delegates form construction to:
 *   - form-structural.ts  (factual / scrapable fields)
 *   - form-opinionated.ts (ephemeral / mood fields)
 *
 * The two sections live under a two-tab switcher so the popup never feels
 * bloated. Default tab is FACTS; user switches to FEELS for the mood panel.
 */

import { buildOpinionatedSection } from "@drama/components/form-opinionated"
import { buildStructuralSection } from "@drama/components/form-structural"
import { MAX_WATCHLIST } from "@drama/lib/popup/constants"
import type { PopupStateMachine } from "@drama/lib/popup/fsm"
import type { DramaEntry, PopupPhase, WatchlistState } from "@drama/types"
import { ACCENT_COLORS } from "@drama/lib/popup/constants"

export class PopupRenderer {
  private root: HTMLElement
  private fsm: PopupStateMachine

  constructor(root: HTMLElement, fsm: PopupStateMachine) {
    this.root = root
    this.fsm = fsm
  }

  private el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    cls?: string
  ): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    return e
  }

  public render(phase: PopupPhase): void {
    this.root.innerHTML = ""
    this.root.appendChild(this.buildHeader(phase))
    const body = this.el("div", "p-body")
    this.root.appendChild(body)

    switch (phase.tag) {
      case "LOADING":
        body.appendChild(this.renderLoading())
        break
      case "IDLE":
        body.appendChild(this.renderIdle(phase))
        break
      case "SCRAPING":
        body.appendChild(this.renderScraping())
        break
      case "FORM":
        body.appendChild(this.renderForm(phase))
        break
      case "SAVING":
        body.appendChild(this.renderSaving())
        break
      case "ERROR":
        body.appendChild(this.renderError(phase))
        break
    }
  }

  // ── Header ─────────────────────────────────────────────────────────────────

  private buildHeader(phase: PopupPhase): HTMLElement {
    const h = this.el("header", "p-header")
    const title = this.el("div", "p-header-title")
    title.appendChild(this.el("span", "p-header-dot"))
    const t = this.el("span")
    t.textContent = "Drama Overlay"
    title.appendChild(t)
    h.appendChild(title)

    if (phase.tag === "IDLE") {
      const addBtn = this.el("button", "p-btn p-btn-sm p-btn-primary")
      addBtn.textContent = "+"
      addBtn.title = "Add entry"
      addBtn.disabled = phase.state.watchlist.length >= MAX_WATCHLIST
      addBtn.addEventListener("click", () => {
        this.fsm.transition({
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

  // ── Spinners ───────────────────────────────────────────────────────────────

  private renderLoading(): HTMLElement {
    return this.spinnerScreen("Syncing…")
  }

  private renderScraping(): HTMLElement {
    return this.spinnerScreen("Reading tab…")
  }

  private renderSaving(): HTMLElement {
    return this.spinnerScreen("Saving…")
  }

  private spinnerScreen(label: string): HTMLElement {
    const wrap = this.el("div", "p-center")
    wrap.appendChild(this.el("div", "p-spinner"))
    const l = this.el("div", "p-muted")
    l.textContent = label
    wrap.appendChild(l)
    return wrap
  }

  // ── Idle ───────────────────────────────────────────────────────────────────

  private renderIdle(phase: Extract<PopupPhase, { tag: "IDLE" }>): HTMLElement {
    const { state, tabId, isVideoTab, videoCount } = phase
    const wrap = this.el("div", "p-idle")

    const banner = this.el(
      "div",
      isVideoTab ? "p-banner p-banner-video" : "p-banner p-banner-other"
    )
    if (isVideoTab) {
      banner.textContent =
        videoCount > 0
          ? `📺 ${videoCount} media frame(s) detected`
          : "📺 Platform detected — no media yet"
    } else {
      banner.textContent = "🖥️ Management view"
    }
    wrap.appendChild(banner)

    const syncRow = this.el("div", "p-sync-action-row")
    const scrapeBtn = this.el("button", "p-btn p-btn-block p-btn-ghost")
    scrapeBtn.textContent = isVideoTab ? "⟳ Extract Tab Context" : "⚡ Force Capture"
    scrapeBtn.addEventListener("click", () =>
      this.fsm.triggerScrape(state, tabId)
    )
    syncRow.appendChild(scrapeBtn)
    wrap.appendChild(syncRow)

    if (state.watchlist.length === 0) {
      const empty = this.el("div", "p-empty")
      empty.innerHTML = `<span class="p-empty-icon">🎬</span>No entries yet.`
      wrap.appendChild(empty)
    } else {
      const list = this.el("div", "p-list")
      for (const entry of state.watchlist) {
        list.appendChild(this.renderEntryRow(entry, state, tabId))
      }
      wrap.appendChild(list)
    }

    const cap = this.el("div", "p-capacity")
    cap.textContent = `${state.watchlist.length} / ${MAX_WATCHLIST}`
    wrap.appendChild(cap)

    return wrap
  }

  private renderEntryRow(
    entry: DramaEntry,
    state: WatchlistState,
    tabId: number
  ): HTMLElement {
    const isActive = entry.id === state.activeId
    const row = this.el("div", `p-entry${isActive ? " p-entry-active" : ""}`)

    const swatch = this.el("div", "p-swatch")
    swatch.style.background = entry.color || ACCENT_COLORS[0]
    row.appendChild(swatch)

    const info = this.el("div", "p-entry-info")
    const titleEl = this.el("div", "p-entry-title")
    titleEl.textContent = entry.title
    info.appendChild(titleEl)

    const meta = this.el("div", "p-entry-meta")
    const seg = [entry.episode, entry.network, entry.year].filter(Boolean).join(" · ")
    // Show rating if set
    const ratingPart = entry.rating > 0 ? `★${entry.rating}` : ""
    const moodPart = entry.activeMood ? MOOD_EMOJI[entry.activeMood] : ""
    const extras = [seg, ratingPart, moodPart].filter(Boolean).join("  ")
    meta.textContent = extras || "—"
    info.appendChild(meta)
    row.appendChild(info)

    const actions = this.el("div", "p-entry-actions")

    const activeToggle = this.el(
      "button",
      `p-btn p-btn-icon${isActive ? " p-btn-active" : ""}`
    )
    activeToggle.title = isActive ? "Currently active" : "Set as active"
    activeToggle.textContent = isActive ? "◉" : "○"
    activeToggle.addEventListener("click", () =>
      this.fsm.setActive(entry.id, tabId)
    )
    actions.appendChild(activeToggle)

    const editBtn = this.el("button", "p-btn p-btn-icon")
    editBtn.textContent = "✎"
    editBtn.title = "Edit"
    editBtn.addEventListener("click", () => {
      this.fsm.transition({
        tag: "FORM",
        state,
        tabId,
        prefill: { ...entry },
        editId: entry.id,
      })
    })
    actions.appendChild(editBtn)

    const removeBtn = this.el("button", "p-btn p-btn-icon p-btn-danger")
    removeBtn.textContent = "✕"
    removeBtn.title = "Remove"
    removeBtn.addEventListener("click", () =>
      this.fsm.removeEntry(entry.id, tabId)
    )
    actions.appendChild(removeBtn)

    row.appendChild(actions)
    return row
  }

  // ── Form (tabbed: FACTS | FEELS) ───────────────────────────────────────────

  private renderForm(phase: Extract<PopupPhase, { tag: "FORM" }>): HTMLElement {
    const { state, tabId, prefill, editId } = phase
    const isEdit = Boolean(editId)

    const wrapper = this.el("div", "pf-wrapper")

    // ── Tab bar ──────────────────────────────────────────────────────────────
    const tabBar = this.el("div", "pf-tab-bar")
    const factsTab = this.el("button", "pf-tab pf-tab-active")
    factsTab.textContent = "📋 Facts"
    const feelsTab = this.el("button", "pf-tab")
    feelsTab.innerHTML = "✦ Feels"
    tabBar.appendChild(factsTab)
    tabBar.appendChild(feelsTab)
    wrapper.appendChild(tabBar)

    // ── Panel host ───────────────────────────────────────────────────────────
    const panelHost = this.el("div", "pf-panel-host")
    wrapper.appendChild(panelHost)

    // ── Build both panels ────────────────────────────────────────────────────
    const { root: structuralPanel, refs: structRefs } = buildStructuralSection(
      this.el.bind(this),
      prefill
    )
    structuralPanel.classList.add("pf-panel", "pf-panel-visible")

    const { root: moodPanel, refs: moodRefs } = buildOpinionatedSection(
      this.el.bind(this),
      prefill
    )
    moodPanel.classList.add("pf-panel")

    panelHost.appendChild(structuralPanel)
    panelHost.appendChild(moodPanel)

    // ── Tab switching ────────────────────────────────────────────────────────
    factsTab.addEventListener("click", () => {
      factsTab.classList.add("pf-tab-active")
      feelsTab.classList.remove("pf-tab-active")
      structuralPanel.classList.add("pf-panel-visible")
      moodPanel.classList.remove("pf-panel-visible")
    })
    feelsTab.addEventListener("click", () => {
      feelsTab.classList.add("pf-tab-active")
      factsTab.classList.remove("pf-tab-active")
      moodPanel.classList.add("pf-panel-visible")
      structuralPanel.classList.remove("pf-panel-visible")
    })

    // ── Action row ───────────────────────────────────────────────────────────
    const actions = this.el("div", "p-btn-row pf-form-actions")

    const cancelBtn = this.el("button", "p-btn p-btn-ghost")
    cancelBtn.textContent = "Cancel"
    cancelBtn.addEventListener("click", () =>
      this.fsm.transition({
        tag: "IDLE",
        state,
        tabId,
        isVideoTab: false,
        videoCount: 0,
      })
    )
    actions.appendChild(cancelBtn)

    const saveBtn = this.el("button", "p-btn p-btn-primary")
    saveBtn.textContent = isEdit ? "Update" : "Add to List"
    saveBtn.addEventListener("click", () => {
      const rawTitle = structRefs.titleInput.value.trim()
      if (!rawTitle) {
        structRefs.titleInput.classList.add("p-input-error")
        structRefs.titleInput.focus()
        // Switch to facts tab so the error is visible
        factsTab.click()
        return
      }

      const payload: Partial<DramaEntry> & { title: string } = {
        id: editId,
        title: rawTitle,
        episode: structRefs.episodeInput.value.trim(),
        network: structRefs.networkInput.value.trim(),
        year: structRefs.yearInput.value.trim(),
        genre: structRefs.genreInput.value.trim(),
        note: structRefs.noteInput.value.trim(),
        color: structRefs.getColor(),
        posterUrl: prefill.posterUrl ?? null,
        timestamp: prefill.timestamp ?? "00:00",
        progress: prefill.progress ?? 0,
        isPlaying: prefill.isPlaying ?? false,
        // Opinionated
        rating: moodRefs.getRating(),
        completionLikelihood: moodRefs.getLikelihood(),
        activeMood: moodRefs.getMood(),
        featuredQuote: moodRefs.getQuote(),
        emotionLabel: moodRefs.getEmotionLabel(),
        overallProgress: moodRefs.getOverallProgress(),
      }

      void this.fsm.saveEntry(payload, state, tabId)
    })
    actions.appendChild(saveBtn)
    wrapper.appendChild(actions)

    return wrapper
  }

  // ── Error ──────────────────────────────────────────────────────────────────

  private renderError(
    phase: Extract<PopupPhase, { tag: "ERROR" }>
  ): HTMLElement {
    const wrap = this.el("div", "p-error-state")
    const icon = this.el("div", "p-error-icon")
    icon.textContent = "⚠"
    wrap.appendChild(icon)
    const msg = this.el("div", "p-error-msg")
    msg.textContent = phase.message
    wrap.appendChild(msg)
    const retry = this.el("button", "p-btn p-btn-ghost")
    retry.textContent = "Retry"
    retry.addEventListener("click", () => void this.fsm.boot())
    wrap.appendChild(retry)
    return wrap
  }
}

// ── Local emoji map (no import cycle) ─────────────────────────────────────────
const MOOD_EMOJI: Record<string, string> = {
  joy: "✨",
  love: "💗",
  sadness: "🌧",
  tension: "⚡",
  cringe: "😬",
  neutral: "〰️",
}
