
import type { BadgeTier, TabRecord } from "@tab/types"
import { BADGE_COLORS, formatMs, formatMsShort, getDomain } from "@tab/types"

const TAG_CONFIG: Record<string, { label: string; color: string; bg: string }> =
  {
    live: { label: "LIVE", color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
    deep_work: {
      label: "DEEP WORK",
      color: "#818cf8",
      bg: "rgba(129,140,248,0.12)",
    },
    rabbit_hole: {
      label: "RABBIT HOLE",
      color: "#f59e0b",
      bg: "rgba(245,158,11,0.12)",
    },
    neglected: {
      label: "NEGLECTED",
      color: "#ef4444",
      bg: "rgba(239,68,68,0.12)",
    },
    intentional: {
      label: "INTENTIONAL",
      color: "#06b6d4",
      bg: "rgba(6,182,212,0.12)",
    },
  }

export interface ContextPanelData {
  record: TabRecord
  tier: BadgeTier
  elapsed: number
  sessionElapsed: number
  tags: string[]
}

export class ContextPanel {
  private el: HTMLElement
  private isOpen = false
  private onClose: () => void

  constructor(onClose: () => void = () => {}) {
    this.onClose = onClose

    this.el = document.createElement("div")
    this.el.className = "__tl_context_panel"
    this.el.style.display = "none"

    // click-outside to close
    document.addEventListener("mousedown", (e) => {
      if (this.isOpen && !this.el.contains(e.target as Node)) {
        this.close()
      }
    })
  }

  open(data: ContextPanelData): void {
    this.isOpen = true
    this.el.style.display = "block"
    this.render(data)
    requestAnimationFrame(() => this.el.classList.add("open"))
  }

  close(): void {
    this.isOpen = false
    this.el.classList.remove("open")
    setTimeout(() => {
      if (!this.isOpen) this.el.style.display = "none"
    }, 200)
    this.onClose()
  }

  toggle(data: ContextPanelData): void {
    if (this.isOpen) {
      this.close()
    } else {
      this.open(data)
    }
  }

  update(data: ContextPanelData): void {
    if (this.isOpen) {
      this.render(data)
    }
  }

  getIsOpen(): boolean {
    return this.isOpen
  }

  private render(data: ContextPanelData): void {
    const { record, tier, elapsed, sessionElapsed, tags } = data
    const color = BADGE_COLORS[tier]
    const domain = getDomain(record.url)

    this.el.innerHTML = ""

    // ── Header ──
    const header = document.createElement("div")
    header.className = "__tl_ctx_header"

    if (record.favicon) {
      const favicon = document.createElement("img")
      favicon.src = record.favicon
      favicon.className = "__tl_ctx_favicon"
      favicon.width = 16
      favicon.height = 16
      header.appendChild(favicon)
    }

    const titleBlock = document.createElement("div")
    titleBlock.className = "__tl_ctx_title_block"

    const title = document.createElement("div")
    title.className = "__tl_ctx_title"
    title.textContent = record.title || domain

    const domainEl = document.createElement("div")
    domainEl.className = "__tl_ctx_domain"
    domainEl.textContent = domain

    titleBlock.appendChild(title)
    titleBlock.appendChild(domainEl)
    header.appendChild(titleBlock)

    const closeBtn = document.createElement("button")
    closeBtn.className = "__tl_ctx_close"
    closeBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`
    closeBtn.addEventListener("click", () => this.close())
    header.appendChild(closeBtn)

    this.el.appendChild(header)

    // ── Divider ──
    const div1 = document.createElement("div")
    div1.className = "__tl_ctx_divider"
    this.el.appendChild(div1)

    // ── Stats grid ──
    const stats = document.createElement("div")
    stats.className = "__tl_ctx_stats"

    const statItems = [
      { label: "Total Time", value: formatMs(elapsed), accent: color },
      { label: "This Session", value: formatMsShort(sessionElapsed), accent: "rgba(255,255,255,0.6)" },
      {
        label: "Status",
        value: record.isActive ? "Active" : "Inactive",
        accent: record.isActive ? "#22c55e" : "rgba(255,255,255,0.3)",
      },
      {
        label: "Tier",
        value: tier.toUpperCase(),
        accent: color,
      },
    ]

    for (const item of statItems) {
      const statEl = document.createElement("div")
      statEl.className = "__tl_ctx_stat"

      const labelEl = document.createElement("div")
      labelEl.className = "__tl_ctx_stat_label"
      labelEl.textContent = item.label

      const valueEl = document.createElement("div")
      valueEl.className = "__tl_ctx_stat_value"
      valueEl.style.color = item.accent
      valueEl.textContent = item.value

      statEl.appendChild(labelEl)
      statEl.appendChild(valueEl)
      stats.appendChild(statEl)
    }

    this.el.appendChild(stats)

    // ── Sparkline ──
    if (record.buckets && record.buckets.length > 0) {
      const sparkSection = document.createElement("div")
      sparkSection.className = "__tl_ctx_section"

      const sparkLabel = document.createElement("div")
      sparkLabel.className = "__tl_ctx_section_label"
      sparkLabel.textContent = "Activity (15-min buckets)"
      sparkSection.appendChild(sparkLabel)

      const spark = this.buildSparkline(record.buckets, color)
      sparkSection.appendChild(spark)

      this.el.appendChild(sparkSection)
    }

    // ── Tags ──
    if (tags.length > 0) {
      const div2 = document.createElement("div")
      div2.className = "__tl_ctx_divider"
      this.el.appendChild(div2)

      const tagsSection = document.createElement("div")
      tagsSection.className = "__tl_ctx_tags"

      for (const tag of tags) {
        const cfg = TAG_CONFIG[tag]
        if (!cfg) continue
        const badge = document.createElement("div")
        badge.className = "__tl_ctx_tag"
        badge.style.color = cfg.color
        badge.style.background = cfg.bg
        badge.style.borderColor = `${cfg.color}33`
        badge.textContent = cfg.label
        tagsSection.appendChild(badge)
      }

      this.el.appendChild(tagsSection)
    }
  }

  private buildSparkline(buckets: number[], color: string): SVGElement {
    const width = 200
    const height = 32
    const max = Math.max(...buckets, 1)
    const count = buckets.length
    const barW = Math.max(2, (width / count) - 1)

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    svg.setAttribute("width", String(width))
    svg.setAttribute("height", String(height))
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`)
    svg.style.overflow = "visible"

    // Build a smooth area path
    const points: [number, number][] = buckets.map((v, i) => [
      (i / (count - 1)) * width,
      height - (v / max) * (height - 4),
    ])

    if (points.length >= 2) {
      const pathD = points.reduce((acc, [x, y], i) => {
        if (i === 0) return `M ${x},${y}`
        const [px, py] = points[i - 1]
        const cpx = (px + x) / 2
        return `${acc} C ${cpx},${py} ${cpx},${y} ${x},${y}`
      }, "")

      const area = document.createElementNS("http://www.w3.org/2000/svg", "path")
      area.setAttribute(
        "d",
        `${pathD} L ${width},${height} L 0,${height} Z`
      )
      area.setAttribute("fill", `${color}22`)
      svg.appendChild(area)

      const line = document.createElementNS("http://www.w3.org/2000/svg", "path")
      line.setAttribute("d", pathD)
      line.setAttribute("fill", "none")
      line.setAttribute("stroke", color)
      line.setAttribute("stroke-width", "1.5")
      line.setAttribute("stroke-linecap", "round")
      svg.appendChild(line)
    } else {
      // Fallback: bar chart
      buckets.forEach((v, i) => {
        const barH = (v / max) * (height - 2)
        const rect = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "rect"
        )
        rect.setAttribute("x", String(i * (barW + 1)))
        rect.setAttribute("y", String(height - barH))
        rect.setAttribute("width", String(barW))
        rect.setAttribute("height", String(barH))
        rect.setAttribute("fill", color)
        rect.setAttribute("rx", "1")
        rect.setAttribute("opacity", "0.7")
        svg.appendChild(rect)
      })
    }

    return svg
  }

  getElement(): HTMLElement {
    return this.el
  }
}
