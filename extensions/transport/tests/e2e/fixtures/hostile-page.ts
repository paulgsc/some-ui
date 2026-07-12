/**
 * Hostile-page fixture (S11) — a synthetic page and a parameterized churn
 * script exercising the sequence the epic names: blank → theme flips →
 * body/head replacement → style removal/addition → SPA navigation → root
 * replacement → virtualized recycling → extension-DOM removal → sustained
 * mutation. No assertion in this file: it only drives the page. Every
 * churn step is agnostic to any property `P` — none of them touch CSS or
 * a domain concept.
 */

import type { Page } from "@playwright/test"

export function hostilePageHtml(): string {
  return `<!doctype html>
<html>
<head><title>hostile</title></head>
<body>
  <div id="content-root"></div>
</body>
</html>`
}

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
        // A real content-script origin (http/https) permits this; the
        // synthetic `about:blank` origin `page.setContent()` loads into
        // does not (a null-origin History API restriction, not anything
        // transport cares about — Session has no navigation-detection
        // heuristic of its own either way, S3). The `popstate` dispatch
        // below is the actually-observable signal a router-detection
        // heuristic would key on, and always fires regardless.
        history.pushState({}, "", "/route-2")
      } catch {
        // ignored — see above
      }
      window.dispatchEvent(new PopStateEvent("popstate"))
    })
  },

  async rootReplace(page: Page): Promise<void> {
    await page.evaluate(() => {
      const newRoot = document.createElement("html")
      newRoot.innerHTML = document.documentElement.innerHTML
      // Hostile scripts occasionally clone/replace the entire tree; here we
      // simulate by wholesale-replacing documentElement's children, since a
      // literal `document.replaceChild` on `<html>` is not observable the
      // same way across engines.
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
        // A virtualized list recycles the *same* physical node to a new
        // logical key with no removal token (Proposition 4.1) — simulated
        // by mutating the same element's data-key/data-value in place.
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
      // A hostile script removing anything it finds, including
      // extension-authored nodes it has no way of knowing are "ours".
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
          const perTick = Math.max(1, Math.round(targetRate / 100)) // ~100 ticks/sec budget
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
}
