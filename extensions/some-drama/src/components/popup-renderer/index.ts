/**
 *
 * Popup renderer. Delegates form panel construction to:
 *   form-structural.ts  (factual / scrapable fields)
 *   form-opinionated.ts (ephemeral / mood fields)
 *
 * Tab visibility works by toggling `.pf-panel-visible` on the bare shell
 * divs returned by the builders. Those shells carry no layout `display` rule —
 * only `.pf-panel { display: none }` and `.pf-panel-visible { display: block }`.
 * The actual flex layout lives on inner `.pf-structural` / `.pf-mood` children.
 */

import { buildOpinionatedSection } from "@drama/components/form-opinionated"
import { buildStructuralSection } from "@drama/components/form-structural"
import type { PopupStateMachine } from "@drama/effects/popup/fsm"
import { DEFAULT_ACCENT, MAX_WATCHLIST } from "@drama/logic/popup/constants"
import type { DramaEntry, PopupPhase, WatchlistState } from "@drama/types"
import { assertNever } from "@some-extension/common"

const MOOD_EMOJI: Record<string, string> = {
  joy: "✨",
  love: "💗",
  sadness: "🌧",
  tension: "⚡",
  cringe: "😬",
  neutral: "〰️",
}

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

    const { tag } = phase
    switch (tag) {
      case "LOADING": {
        body.appendChild(this.spinnerScreen("Syncing…"))
        break
      }
      case "IDLE": {
        body.appendChild(this.renderIdle(phase))
        break
      }
      case "SCRAPING": {
        body.appendChild(this.spinnerScreen("Reading tab…"))
        break
      }
      case "FORM": {
        body.appendChild(this.renderForm(phase))
        break
      }
      case "SAVING": {
        body.appendChild(this.spinnerScreen("Saving…"))
        break
      }
      case "ERROR": {
        body.appendChild(this.renderError(phase))
        break
      }
      default: {
        tag satisfies never
        assertNever(tag)
      }
    }
  }

  // ── Header ─────────────────────────────────────────────────────────────────

  private buildHeader(phase: PopupPhase): HTMLElement {
    const h = this.el("header", "p-header flex items-center justify-between")
    const title = this.el("div", "p-header-title flex items-center gap-2.5")
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

  private spinnerScreen(label: string): HTMLElement {
    const wrap = this.el(
      "div",
      "p-center flex flex-col items-center justify-center gap-3"
    )
    wrap.appendChild(this.el("div", "p-spinner"))
    const l = this.el("div", "p-muted")
    l.textContent = label
    wrap.appendChild(l)
    return wrap
  }

  // ── Idle ───────────────────────────────────────────────────────────────────

  private renderIdle(phase: Extract<PopupPhase, { tag: "IDLE" }>): HTMLElement {
    const { state, tabId, site, isStreamSite, videoCount } = phase
    const wrap = this.el("div", "p-idle")

    wrap.appendChild(this.renderSiteRow(site, isStreamSite, videoCount, tabId))

    const syncRow = this.el("div", "p-sync-action-row")
    const scrapeBtn = this.el("button", "p-btn p-btn-block p-btn-ghost")
    scrapeBtn.textContent = isStreamSite
      ? "⟳ Extract Tab Context"
      : "⚡ Force Capture"
    scrapeBtn.addEventListener(
      "click",
      () => void this.fsm.triggerScrape(state, tabId)
    )
    syncRow.appendChild(scrapeBtn)
    wrap.appendChild(syncRow)

    if (state.watchlist.length === 0) {
      const empty = this.el("div", "p-empty")
      empty.innerHTML = `<span class="p-empty-icon">🎬</span>No entries yet.`
      wrap.appendChild(empty)
    } else {
      const list = this.el("div", "p-list flex flex-col gap-1.5")
      for (const entry of state.watchlist) {
        list.appendChild(this.renderEntryRow(entry, state, tabId))
      }
      wrap.appendChild(list)
    }

    const cap = this.el("div", "p-capacity")
    cap.textContent = `${state.watchlist.length} / ${MAX_WATCHLIST}`
    wrap.appendChild(cap)

    wrap.appendChild(this.renderStreamSites(state.streamSites, tabId))
    return wrap
  }

  // ── Streaming sites ────────────────────────────────────────────────────────
  // Every tab shows the card unless its site is marked here; a marked site's
  // tabs are where the drama plays (no card, beats carry their video time).

  private renderSiteRow(
    site: string,
    isStreamSite: boolean,
    videoCount: number,
    tabId: number
  ): HTMLElement {
    const row = this.el(
      "div",
      `p-banner p-site-row flex items-center justify-between gap-2 ${
        isStreamSite ? "p-banner-video" : "p-banner-other"
      }`
    )
    const label = this.el("span", "p-site-label")
    const videos =
      videoCount > 0
        ? ` · ${videoCount} video${videoCount === 1 ? "" : "s"}`
        : ""
    label.textContent = !site
      ? "🖥️ Not a web page"
      : isStreamSite
        ? `📺 ${site} · streaming site${videos}`
        : `🖥️ ${site} · shows the card${videos}`
    row.appendChild(label)

    if (site) {
      const toggle = this.el("button", "p-btn p-btn-ghost p-site-toggle")
      toggle.textContent = isStreamSite ? "Unmark" : "Mark as streaming"
      toggle.title = isStreamSite
        ? `Show the card on ${site} again`
        : `The drama plays on ${site}: hide the card there and log its video time`
      toggle.addEventListener(
        "click",
        () => void this.fsm.setStreamSite(site, !isStreamSite, tabId)
      )
      row.appendChild(toggle)
    }
    return row
  }

  private renderStreamSites(
    sites: ReadonlyArray<string>,
    tabId: number
  ): HTMLElement {
    const section = this.el("div", "p-sites flex flex-col gap-1.5")
    const heading = this.el("div", "p-label")
    heading.textContent = "Streaming sites"
    section.appendChild(heading)

    if (sites.length === 0) {
      const hint = this.el("div", "p-sites-empty")
      hint.textContent =
        "None yet — every tab shows the card. Open the drama and mark its site."
      section.appendChild(hint)
      return section
    }

    const chips = this.el("div", "flex flex-wrap gap-1.5")
    for (const site of sites) {
      const chip = this.el("span", "p-site-chip inline-flex items-center gap-1")
      const name = this.el("span")
      name.textContent = site
      const remove = this.el("button", "p-site-chip-remove")
      remove.textContent = "✕"
      remove.title = `Unmark ${site}`
      remove.addEventListener(
        "click",
        () => void this.fsm.setStreamSite(site, false, tabId)
      )
      chip.appendChild(name)
      chip.appendChild(remove)
      chips.appendChild(chip)
    }
    section.appendChild(chips)
    return section
  }

  private renderEntryRow(
    entry: DramaEntry,
    state: WatchlistState,
    tabId: number
  ): HTMLElement {
    const isActive = entry.id === state.activeId
    const row = this.el(
      "div",
      `p-entry flex items-center gap-2.5${isActive ? " p-entry-active" : ""}`
    )

    const swatch = this.el("div", "p-swatch")
    swatch.style.background = entry.color || DEFAULT_ACCENT
    row.appendChild(swatch)

    const info = this.el("div", "p-entry-info")
    const titleEl = this.el("div", "p-entry-title")
    titleEl.textContent = entry.title
    info.appendChild(titleEl)

    const meta = this.el("div", "p-entry-meta")
    const seg = [entry.episode, entry.network, entry.year]
      .filter(Boolean)
      .join(" · ")
    const ratingPart = entry.rating > 0 ? `★${entry.rating}` : ""
    const moodPart = entry.activeMood ? MOOD_EMOJI[entry.activeMood] : ""
    meta.textContent =
      [seg, ratingPart, moodPart].filter(Boolean).join("  ") || "—"
    info.appendChild(meta)
    row.appendChild(info)

    const actions = this.el("div", "p-entry-actions flex gap-1")

    const activeToggle = this.el(
      "button",
      `p-btn p-btn-icon${isActive ? " p-btn-active" : ""}`
    )
    activeToggle.title = isActive ? "Currently active" : "Set as active"
    activeToggle.textContent = isActive ? "◉" : "○"
    activeToggle.addEventListener(
      "click",
      () => void this.fsm.setActive(entry.id, tabId)
    )
    actions.appendChild(activeToggle)

    // QoL-3: refresh structural fields for the active entry without touching
    // opinionated ones. Only shown on the active entry since that's the one
    // content.ts is displaying — refreshing an inactive entry has no effect.
    if (isActive) {
      const refreshBtn = this.el("button", "p-btn p-btn-icon")
      refreshBtn.textContent = "⟳"
      refreshBtn.title = "Refresh tab context (keeps your ratings & mood)"
      refreshBtn.addEventListener(
        "click",
        () => void this.fsm.refreshEntry(entry, tabId, state)
      )
      actions.appendChild(refreshBtn)
    }

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
    removeBtn.addEventListener(
      "click",
      () => void this.fsm.removeEntry(entry.id, tabId)
    )
    actions.appendChild(removeBtn)

    row.appendChild(actions)
    return row
  }

  // ── Form (tabbed) ──────────────────────────────────────────────────────────

  private renderForm(phase: Extract<PopupPhase, { tag: "FORM" }>): HTMLElement {
    const { state, tabId, prefill, editId } = phase
    const isEdit = Boolean(editId)

    const wrapper = this.el("div", "pf-wrapper flex flex-col")

    // ── Tab bar ──────────────────────────────────────────────────────────────
    const tabBar = this.el("div", "pf-tab-bar")
    const factsTab = this.el("button", "pf-tab pf-tab-active")
    factsTab.textContent = "📋 Facts"
    const feelsTab = this.el("button", "pf-tab")
    feelsTab.textContent = "✦ Feels"
    tabBar.appendChild(factsTab)
    tabBar.appendChild(feelsTab)
    wrapper.appendChild(tabBar)

    // ── Panel host ────────────────────────────────────────────────────────────
    const panelHost = this.el("div", "pf-panel-host")
    wrapper.appendChild(panelHost)

    // ── Build panels — builders return bare shell divs ─────────────────────
    const { root: structShell, refs: structRefs } = buildStructuralSection(
      this.el.bind(this),
      prefill
    )
    // Assign visibility classes to the shell (not to the inner layout div)
    structShell.className = "pf-panel pf-panel-visible"

    const { root: moodShell, refs: moodRefs } = buildOpinionatedSection(prefill)
    moodShell.className = "pf-panel"

    panelHost.appendChild(structShell)
    panelHost.appendChild(moodShell)

    // ── Tab switching ─────────────────────────────────────────────────────────
    factsTab.addEventListener("click", () => {
      factsTab.classList.add("pf-tab-active")
      feelsTab.classList.remove("pf-tab-active")
      structShell.classList.add("pf-panel-visible")
      moodShell.classList.remove("pf-panel-visible")
    })
    feelsTab.addEventListener("click", () => {
      feelsTab.classList.add("pf-tab-active")
      factsTab.classList.remove("pf-tab-active")
      moodShell.classList.add("pf-panel-visible")
      structShell.classList.remove("pf-panel-visible")
    })

    // ── Action row ────────────────────────────────────────────────────────────
    const actions = this.el(
      "div",
      "p-btn-row pf-form-actions flex justify-end gap-2"
    )

    const cancelBtn = this.el("button", "p-btn p-btn-ghost")
    cancelBtn.textContent = "Cancel"
    cancelBtn.addEventListener("click", () => {
      // Re-read state and the active tab rather than guess the banner.
      void this.fsm.backToIdle(tabId)
    })
    actions.appendChild(cancelBtn)

    const saveBtn = this.el("button", "p-btn p-btn-primary")
    saveBtn.textContent = isEdit ? "Update" : "Add to List"
    saveBtn.addEventListener("click", () => {
      const rawTitle = structRefs.titleInput.value.trim()
      if (!rawTitle) {
        structRefs.titleInput.classList.add("p-input-error")
        structRefs.titleInput.focus()
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
        url: structRefs.urlInput.value.trim(),
        color: structRefs.getColor(),
        posterUrl: prefill.posterUrl ?? null,
        timestamp: prefill.timestamp ?? "00:00",
        progress: prefill.progress ?? 0,
        isPlaying: prefill.isPlaying ?? false,
        rating: moodRefs.getRating(),
        completionLikelihood: moodRefs.getLikelihood(),
        featuredQuote: moodRefs.getQuote(),
        overallProgress: moodRefs.getOverallProgress(),
        axes: moodRefs.getAxes(),
        transition: moodRefs.getTransition(),
        tags: moodRefs.getTags(),
        peakLine: moodRefs.getPeakLine(),
        momentum: moodRefs.getMomentum(),
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
    const wrap = this.el(
      "div",
      "p-error-state flex flex-col items-center gap-2.5"
    )
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
