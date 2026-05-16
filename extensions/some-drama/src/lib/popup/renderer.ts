import { ACCENT_COLORS, MAX_WATCHLIST } from "@drama/lib/popup/constants"
import type { PopupStateMachine } from "@drama/lib/popup/fsm"
import type { DramaEntry, PopupPhase, WatchlistState } from "@drama/types"

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

    // Construct persistent frame header component
    this.root.appendChild(this.buildHeader(phase))

    const bodyContainer = this.el("div", "p-body")
    this.root.appendChild(bodyContainer)

    switch (phase.tag) {
      case "LOADING":
        bodyContainer.appendChild(this.renderLoading())
        break
      case "IDLE":
        bodyContainer.appendChild(this.renderIdle(phase))
        break
      case "SCRAPING":
        bodyContainer.appendChild(this.renderScraping())
        break
      case "FORM":
        bodyContainer.appendChild(this.renderForm(phase))
        break
      case "SAVING":
        bodyContainer.appendChild(this.renderSaving())
        break
      case "ERROR":
        bodyContainer.appendChild(this.renderError(phase))
        break
    }
  }

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
      addBtn.title = "Add entry manually"
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

  private renderLoading(): HTMLElement {
    const wrap = this.el("div", "p-center")
    wrap.appendChild(this.el("div", "p-spinner"))
    const label = this.el("div", "p-muted")
    label.textContent = "Syncing local environment…"
    wrap.appendChild(label)
    return wrap
  }

  private renderScraping(): HTMLElement {
    const wrap = this.el("div", "p-center")
    wrap.appendChild(this.el("div", "p-spinner"))
    const label = this.el("div", "p-muted")
    label.textContent = "Scraping media nodes from target tab…"
    wrap.appendChild(label)
    return wrap
  }

  private renderSaving(): HTMLElement {
    const wrap = this.el("div", "p-center")
    wrap.appendChild(this.el("div", "p-spinner"))
    const label = this.el("div", "p-muted")
    label.textContent = "Writing entry matrices…"
    wrap.appendChild(label)
    return wrap
  }

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
          ? `📺 Active Target — ${videoCount} media frame(s) isolated`
          : "📺 Platform Detected — Awaiting runtime media injection"
    } else {
      banner.textContent = "🖥️ Management Space — Metadata capturing offline"
    }
    wrap.appendChild(banner)

    // Capture control action row
    const syncRow = this.el("div", "p-sync-action-row")
    const scrapeBtn = this.el("button", "p-btn p-btn-block p-btn-ghost")
    scrapeBtn.textContent = isVideoTab
      ? "⟳ Extract Tab Context"
      : "⚡ Force Diagnostic Capture"
    scrapeBtn.addEventListener("click", () =>
      this.fsm.triggerScrape(state, tabId)
    )
    syncRow.appendChild(scrapeBtn)
    wrap.appendChild(syncRow)

    if (state.watchlist.length === 0) {
      const empty = this.el("div", "p-empty")
      empty.innerHTML = `<span class="p-empty-icon">🎬</span>No tracked entry references.<br/>
        <span class="p-muted">${isVideoTab ? "Initialize extraction or populate parameters manual." : "Navigate to a video stream source to parse."}</span>`
      wrap.appendChild(empty)
    } else {
      const list = this.el("div", "p-list")
      for (const entry of state.watchlist) {
        list.appendChild(this.renderEntryRow(entry, state, tabId))
      }
      wrap.appendChild(list)
    }

    const capacityIndicator = this.el("div", "p-capacity")
    capacityIndicator.textContent = `${state.watchlist.length} / ${MAX_WATCHLIST} concurrent indices`
    wrap.appendChild(capacityIndicator)

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
    const title = this.el("div", "p-entry-title")
    title.textContent = entry.title
    info.appendChild(title)

    const meta = this.el("div", "p-entry-meta")
    const segmentMetrics = [entry.episode, entry.network, entry.year]
      .filter(Boolean)
      .join("  ·  ")
    meta.textContent =
      entry.timestamp && entry.timestamp !== "00:00"
        ? `${segmentMetrics} [${entry.timestamp}]`
        : segmentMetrics
    info.appendChild(meta)
    row.appendChild(info)

    const actions = this.el("div", "p-entry-actions")

    const activeToggle = this.el(
      "button",
      `p-btn p-btn-icon${isActive ? " p-btn-active" : ""}`
    )
    activeToggle.title = isActive
      ? "Active reference tracking layer"
      : "Bind view layer to this index"
    activeToggle.textContent = isActive ? "◉" : "○"
    activeToggle.addEventListener("click", () =>
      this.fsm.setActive(entry.id, tabId)
    )
    actions.appendChild(activeToggle)

    const editBtn = this.el("button", "p-btn p-btn-icon")
    editBtn.textContent = "✎"
    editBtn.title = "Modify parameter sets"
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
    removeBtn.title = "Delete structural index allocation"
    removeBtn.addEventListener("click", () =>
      this.fsm.removeEntry(entry.id, tabId)
    )
    actions.appendChild(removeBtn)

    row.appendChild(actions)
    return row
  }

  private renderForm(phase: Extract<PopupPhase, { tag: "FORM" }>): HTMLElement {
    const { state, tabId, prefill, editId } = phase
    const isEdit = Boolean(editId)

    const formWrapper = this.el("div", "p-form")
    const heading = this.el("div", "p-form-heading")
    heading.textContent = isEdit
      ? "Modify Tracked Profile"
      : "Register Tracked Context"
    formWrapper.appendChild(heading)

    // Interactive extraction metadata telemetry bar
    if (prefill.timestamp || prefill.progress) {
      const telemetryBar = this.el("div", "p-telemetry-badge-bar")
      telemetryBar.innerHTML = `
        <span class="p-tbadge">⏱️ Captured: ${prefill.timestamp || "00:00"}</span>
        <span class="p-tbadge">📈 Ratio: ${Math.round((prefill.progress || 0) * 100)}%</span>
        <span class="p-tbadge">${prefill.isPlaying ? "🟢 Live Node" : "⏸️ Paused Node"}</span>
      `
      formWrapper.appendChild(telemetryBar)
    }

    // High Importance Field (Full Width)
    const titleGroup = this.el("div", "p-field")
    const titleLabel = this.el("label", "p-label")
    titleLabel.textContent = "Primary Title Matrix *"
    const titleInput = this.el("input", "p-input")
    titleInput.id = "pf-title"
    titleInput.value = prefill.title || ""
    titleInput.placeholder = "e.g., Love Between Fairy and Devil"
    titleGroup.appendChild(titleLabel)
    titleGroup.appendChild(titleInput)
    formWrapper.appendChild(titleGroup)

    // Compact Form Matrix Grid System
    const formGrid = this.el("div", "p-form-grid")

    const createGridField = (lbl: string, id: string, val = "", ph = "") => {
      const grp = this.el("div", "p-field")
      const l = this.el("label", "p-label")
      l.textContent = lbl
      const inp = this.el("input", "p-input")
      inp.id = `pf-${id}`
      inp.value = val
      inp.placeholder = ph
      grp.appendChild(l)
      grp.appendChild(inp)
      return grp
    }

    formGrid.appendChild(
      createGridField(
        "Episode Vector",
        "episode",
        prefill.episode ?? "",
        "e.g., Ep 12"
      )
    )
    formGrid.appendChild(
      createGridField(
        "Network Identity",
        "network",
        prefill.network ?? "",
        "e.g., tvN"
      )
    )
    formGrid.appendChild(
      createGridField("Release Year", "year", prefill.year ?? "", "e.g., 2022")
    )
    formGrid.appendChild(
      createGridField(
        "Genre Registry",
        "genre",
        prefill.genre ?? "",
        "e.g., Xianxia, Fantasy"
      )
    )

    formWrapper.appendChild(formGrid)

    // Dynamic Context Field (Full Width)
    const noteGroup = this.el("div", "p-field")
    const noteLabel = this.el("label", "p-label")
    noteLabel.textContent = "Annotation Registry Logs"
    const noteInput = this.el("input", "p-input")
    noteInput.id = "pf-note"
    noteInput.value = prefill.note ?? ""
    noteInput.placeholder = "Log contextual properties or workspace details..."
    noteGroup.appendChild(noteLabel)
    noteGroup.appendChild(noteInput)
    formWrapper.appendChild(noteGroup)

    // Color picker element row
    const colorGroup = this.el("div", "p-field")
    const colorLabel = this.el("label", "p-label")
    colorLabel.textContent = "Visual Mapping Identifier Theme"
    colorGroup.appendChild(colorLabel)
    const colorRow = this.el("div", "p-color-row")
    let chosenColor = prefill.color || ACCENT_COLORS[0]

    for (const c of ACCENT_COLORS) {
      const swatch = this.el(
        "button",
        `p-color-swatch${c === chosenColor ? " p-color-selected" : ""}`
      )
      swatch.style.background = c
      swatch.addEventListener("click", () => {
        chosenColor = c
        colorRow
          .querySelectorAll(".p-color-swatch")
          .forEach((s) => s.classList.toggle("p-color-selected", s === swatch))
      })
      colorRow.appendChild(swatch)
    }
    colorGroup.appendChild(colorRow)
    formWrapper.appendChild(colorGroup)

    // Process control elements
    const interactiveActions = this.el("div", "p-btn-row")

    const cancelBtn = this.el("button", "p-btn p-btn-ghost")
    cancelBtn.textContent = "Abort"
    cancelBtn.addEventListener("click", () =>
      this.fsm.transition({
        tag: "IDLE",
        state,
        tabId,
        isVideoTab: false,
        videoCount: 0,
      })
    )
    interactiveActions.appendChild(cancelBtn)

    const saveBtn = this.el("button", "p-btn p-btn-primary")
    saveBtn.textContent = isEdit
      ? "Commit Target Configuration"
      : "Insert Watchlist Model"
    saveBtn.addEventListener("click", () => {
      const rawTitle = titleInput.value.trim()
      if (!rawTitle) {
        titleInput.classList.add("p-input-error")
        titleInput.focus()
        return
      }

      const payload: Partial<DramaEntry> & { title: string } = {
        id: editId,
        title: rawTitle,
        episode:
          (
            formWrapper.querySelector("#pf-episode") as HTMLInputElement
          )?.value?.trim() || "",
        network:
          (
            formWrapper.querySelector("#pf-network") as HTMLInputElement
          )?.value?.trim() || "",
        year:
          (
            formWrapper.querySelector("#pf-year") as HTMLInputElement
          )?.value?.trim() || "",
        genre:
          (
            formWrapper.querySelector("#pf-genre") as HTMLInputElement
          )?.value?.trim() || "",
        note: noteInput.value.trim(),
        color: chosenColor,
        posterUrl: prefill.posterUrl || null,
        timestamp: prefill.timestamp || "00:00",
        progress: prefill.progress || 0,
        isPlaying: prefill.isPlaying || false,
      }

      void this.fsm.saveEntry(payload, state, tabId)
    })
    interactiveActions.appendChild(saveBtn)
    formWrapper.appendChild(interactiveActions)

    return formWrapper
  }

  private renderError(
    phase: Extract<PopupPhase, { tag: "ERROR" }>
  ): HTMLElement {
    const wrap = this.el("div", "p-error-state")
    const icon = this.el("div", "p-error-icon")
    icon.textContent = "⚠"
    wrap.appendChild(icon)
    const errorMsg = this.el("div", "p-error-msg")
    errorMsg.textContent = phase.message
    wrap.appendChild(errorMsg)

    const retryBtn = this.el("button", "p-btn p-btn-ghost")
    retryBtn.textContent = "Reinitialize Runtime Link"
    retryBtn.addEventListener("click", () => void this.fsm.boot())
    wrap.appendChild(retryBtn)
    return wrap
  }
}
