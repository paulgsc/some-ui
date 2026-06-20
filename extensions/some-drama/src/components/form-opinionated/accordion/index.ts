// ── Accordion ─────────────────────────────────────────────────────────────
// Single-open accordion item. Owns: open/close state, height animation.
// Parent controls exclusivity via the `group` callback.

import { el } from "@drama/lib/content/utils"

export type AccordionItem = {
  root: HTMLDivElement
  setOpen: (open: boolean) => void
  isOpen: () => boolean
}

export function buildAccordionItem(
  title: string,
  body: HTMLElement,
  onToggle: (self: AccordionItem) => void
): AccordionItem {
  const root = el("div", "dj-accordion-item")

  const header = el("button", "dj-accordion-header flex items-center justify-between")
  header.type = "button"
  const titleSpan = el("span")
  titleSpan.textContent = title
  const chevron = el("span", "dj-accordion-chevron inline-flex")
  chevron.textContent = "▾"
  header.appendChild(titleSpan)
  header.appendChild(chevron)

  const panel = el("div", "dj-accordion-panel")
  const panelBody = el("div", "dj-accordion-body")
  panelBody.appendChild(body)
  panel.appendChild(panelBody)

  root.appendChild(header)
  root.appendChild(panel)

  let open = false

  const item: AccordionItem = {
    root,
    isOpen: () => open,
    setOpen: (next: boolean) => {
      open = next
      root.classList.toggle("dj-open", open)
      if (open) {
        // Measure natural height for the max-height transition
        panel.style.setProperty(
          "--dj-panel-height",
          `${panelBody.scrollHeight + 40}px`
        )
      }
    },
  }

  header.addEventListener("click", () => onToggle(item))

  return item
}

/** Wires a group of accordion items so only one is open at a time. */
export function buildAccordionGroup(
  items: ReadonlyArray<{ title: string; body: HTMLElement }>,
  initiallyOpenIndex = 0
): { root: HTMLDivElement; items: Array<AccordionItem> } {
  const root = el("div", "dj-accordion-group")
  const built: Array<AccordionItem> = []

  items.forEach(({ title, body }) => {
    const item = buildAccordionItem(title, body, (self) => {
      const wasOpen = self.isOpen()
      built.forEach((it) => it.setOpen(false))
      if (!wasOpen) self.setOpen(true)
    })
    built.push(item)
    root.appendChild(item.root)
  })

  if (built[initiallyOpenIndex]) {
    built[initiallyOpenIndex].setOpen(true)
  }

  return { root, items: built }
}
