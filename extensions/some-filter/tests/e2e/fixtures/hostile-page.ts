/**
 * Hostile-page churn fixture — vendored from
 * `extensions/transport/tests/e2e/fixtures/hostile-page.ts` (#618's S11
 * conformance fixture), per S6's own task list ("import or vendor
 * hostile-page.ts"). Vendored rather than imported: transport's package
 * exports map (`"./*": "./src/*.ts"`) only covers `src/`, not `tests/`, and
 * these churn steps are property-agnostic by design — none of them touch
 * CSS or a domain concept, so copying introduces no drift risk the
 * original didn't already guard against. No assertion lives here: it only
 * drives the page. See `specs/swatch-oracle.spec.ts` for the proof.
 */

import type { Page } from "@playwright/test"

export const churn = {
  async blank(page: Page): Promise<void> {
    await page.evaluate(() => {
      document.body.innerHTML = ""
    })
  },

  async themeFlip(page: Page): Promise<void> {
    await page.evaluate(() => {
      document.documentElement.classList.toggle("dark")
      document.documentElement.classList.toggle("light")
    })
  },

  async bodyHeadReplace(page: Page): Promise<void> {
    await page.evaluate(() => {
      const newHead = document.createElement("head")
      const newBody = document.createElement("body")
      newBody.innerHTML = '<div id="content-root"></div>'
      document.documentElement.replaceChild(newHead, document.head)
      document.documentElement.replaceChild(newBody, document.body)
    })
  },

  async styleChurn(page: Page): Promise<void> {
    await page.evaluate(() => {
      const style = document.createElement("style")
      style.textContent = "body { background: black; }"
      document.head.appendChild(style)
      style.remove()
    })
  },

  async spaNavigate(page: Page): Promise<void> {
    await page.evaluate(() => {
      try {
        history.pushState({}, "", "/route-2")
      } catch {
        // A real content-script origin permits this; a null-origin
        // synthetic page does not — the popstate dispatch below is the
        // actually-observable signal a router-detection heuristic keys on,
        // and always fires regardless.
      }
      window.dispatchEvent(new PopStateEvent("popstate"))
    })
  },

  async rootReplace(page: Page): Promise<void> {
    await page.evaluate(() => {
      const newRoot = document.createElement("html")
      newRoot.innerHTML = document.documentElement.innerHTML
      while (document.documentElement.firstChild !== null) {
        document.documentElement.removeChild(
          document.documentElement.firstChild
        )
      }
      while (newRoot.firstChild !== null) {
        document.documentElement.appendChild(newRoot.firstChild)
      }
    })
  },

  async virtualizedRecycle(
    page: Page,
    selector: string,
    key: string,
    value: number
  ): Promise<void> {
    await page.evaluate(
      ({ selector, key, value }) => {
        const root = document.querySelector(selector)
        if (root === null) return
        let el = root.querySelector("[data-recycled-node]")
        if (el === null) {
          el = document.createElement("div")
          el.setAttribute("data-recycled-node", "")
          root.appendChild(el)
        }
        el.setAttribute("data-key", key)
        el.setAttribute("data-value", String(value))
      },
      { selector, key, value }
    )
  },

  async extensionDomRemoval(page: Page, selector: string): Promise<void> {
    await page.evaluate((selector) => {
      for (const el of Array.from(document.querySelectorAll(selector))) {
        el.remove()
      }
    }, selector)
  },

  async sustainedMutation(
    page: Page,
    durationMs: number,
    targetRate = 1000
  ): Promise<void> {
    await page.evaluate(
      ({ durationMs, targetRate }) => {
        return new Promise<void>((resolve) => {
          const root = document.querySelector("#content-root") ?? document.body
          const start = performance.now()
          let count = 0
          const perTick = Math.max(1, Math.round(targetRate / 100))
          function tick(): void {
            for (let i = 0; i < perTick; i++) {
              const el = document.createElement("div")
              el.setAttribute("data-key", `churn-${count % 20}`)
              el.setAttribute("data-value", String(count))
              root.appendChild(el)
              const oldest = root.firstElementChild
              if (root.children.length > 50 && oldest !== null) {
                root.removeChild(oldest)
              }
              count++
            }
            if (performance.now() - start < durationMs) {
              setTimeout(tick, 10)
            } else {
              resolve()
            }
          }
          tick()
        })
      },
      { durationMs, targetRate }
    )
  },

  /**
   * Not present in transport's original fixture: some-filter-specific
   * churn exercising the per-surface path directly — a vendor script
   * mutating an *existing* element's background color in place (Remark
   * 2.6's endogenous coupling; the attributeFilter: ["class", "style"]
   * case classifyElement/decide was written for).
   */
  async recolorInPlace(
    page: Page,
    selector: string,
    css: string
  ): Promise<void> {
    await page.evaluate(
      ({ selector, css }) => {
        const el = document.querySelector(selector)
        if (el instanceof HTMLElement) {
          el.style.backgroundColor = css
        }
      },
      { selector, css }
    )
  },
}
