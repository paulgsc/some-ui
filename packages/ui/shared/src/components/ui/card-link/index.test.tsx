/**
 * What `CardLink` owns (#3234): it is a link, through its child when asked,
 * with the card's words and a chevron inside that one link, and the shared
 * look on it, so a card that opens something never looks like one that
 * doesn't.
 */
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { CARD_LINK_CLASS, CardLink, CardLinkBody } from "."

describe("CardLink", () => {
  it("is one link holding its words and a chevron", () => {
    render(
      <CardLink href="/questions">
        <CardLinkBody>
          <span>Questions</span>
          <span>4 questions · about 1 min 30 s each</span>
        </CardLinkBody>
      </CardLink>
    )
    const link = screen.getByRole("link", { name: /^Questions/ })
    expect(link.getAttribute("href")).toBe("/questions")
    expect(link.hasAttribute("data-card-link")).toBe(true)
    expect(link.querySelector("svg")).not.toBeNull()
    expect(link.className).toContain("border-2")
  })

  it("renders through its child, keeping the child's own link", () => {
    render(
      <CardLink asChild className="mt-2">
        <a href="/how" data-router="">
          <CardLinkBody>How a week goes</CardLinkBody>
        </a>
      </CardLink>
    )
    const links = screen.getAllByRole("link")
    expect(links).toHaveLength(1)
    const [link] = links
    expect(link?.getAttribute("href")).toBe("/how")
    expect(link?.hasAttribute("data-router")).toBe(true)
    expect(link?.hasAttribute("data-card-link")).toBe(true)
    expect(link?.className).toContain("mt-2")
    expect(link?.querySelector("svg")).not.toBeNull()
    expect(link?.textContent).toBe("How a week goes")
  })

  it("keeps one look for every caller", () => {
    expect(CARD_LINK_CLASS).toMatch(/\bborder-2\b/)
    expect(CARD_LINK_CLASS).toMatch(/\bshadow-md\b/)
  })
})
