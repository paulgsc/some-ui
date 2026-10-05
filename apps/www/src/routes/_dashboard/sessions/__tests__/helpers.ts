import { fireEvent, screen, within } from "@testing-library/react"

/** Ticks every row's checkbox, which opens the bulk selection toolbar. */
export function selectAllSessions(): void {
  for (const checkbox of screen.getAllByRole("checkbox")) {
    fireEvent.click(checkbox)
  }
}

/** The bulk bar's "Delete", scoped to the toolbar that renders once
 * something is selected (`{count} selected`), not a card's own. */
export function bulkDeleteButton(): HTMLElement {
  const root = screen.getByText(/selected$/).closest("div")
  if (!(root instanceof HTMLElement)) {
    throw new Error("bulk selection toolbar not found")
  }
  return within(root).getByRole("button", { name: /delete/i })
}
