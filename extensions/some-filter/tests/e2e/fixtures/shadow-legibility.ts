/**
 * Shadow-scope drivers for the rendered-contrast channel — the shadow-DOM
 * counterpart to `legibility-repair-page.html`'s regions, built from the
 * spec so each scope's creation timing stays controlled by the test.
 *
 * Every surface is in **normal flow**, not `position: fixed`:
 * `resolveEffectiveBackdrop` returns `"underdetermined"` beneath any
 * non-`static` ancestor, so a fixed surface would make the fixture pass
 * vacuously.
 *
 * No assertion lives here; see `issue-1342-sfrc3-shadow-foreground.spec.ts`.
 */

import type { Page } from "@playwright/test"

/**
 * The two Gate-0 witnesses reproduced inside one open shadow root, on the
 * shapes `legibility-repair-page.html` uses at document scope:
 *
 *   - `chip` — escape route 2: the button repeats its surface parent's
 *     colour and owns no background, so the surface's `textCss` fix is
 *     overridden and no per-surface action can name the button.
 *   - `label` — escape route 1: own explicit colour, no own background;
 *     never enters the per-surface hypothesis.
 *
 * Plus `transitioned`: witness B's shape with a vendor `transition` on
 * `color` (the hazard the audit's scope freeze exists for), in its own
 * colour so it resolves to its own `LegibilityKey`.
 *
 * The surface is light, so the scope themes, and both carriers end up
 * dark-on-dark except for the foreground-repair alphabet.
 */
const WITNESS_MARKUP = `
  <div class="sf-rc3-surface"
       style="margin:0;padding:16px;background-color:rgb(255,255,255);color:rgb(17,17,17)">
    Nav label
    <button class="sf-rc3-chip"
            style="background-color:transparent;border:0;font:inherit;color:rgb(17,17,17)">
      Shorts
    </button>
    <div class="sf-rc3-label" style="color:rgb(0,0,0)">Subscriptions</div>
    <div class="sf-rc3-transitioned"
         style="color:rgb(5,5,5);transition:color 0.3s linear">
      A shadow-hosted carrier whose own colour is under a vendor transition.
    </div>
  </div>
`

/** Attaches one open root carrying both witnesses to a fresh host with id `hostId`. */
export async function mountShadowWitnesses(
  page: Page,
  hostId: string
): Promise<void> {
  await page.evaluate(
    ({ hostId, markup }: { hostId: string; markup: string }) => {
      const host = document.createElement("div")
      host.id = hostId
      const root = host.attachShadow({ mode: "open" })
      root.innerHTML = markup
      const anchor = document.getElementById("host-anchor")
      if (anchor === null) throw new Error("fixture missing #host-anchor")
      anchor.appendChild(host)
    },
    { hostId, markup: WITNESS_MARKUP }
  )
}

/**
 * The same witnesses, two shadow levels deep: an open root whose only
 * content is a host for a second open root.
 */
export async function mountNestedShadowWitnesses(
  page: Page,
  outerHostId: string,
  innerHostId: string
): Promise<void> {
  await page.evaluate(
    ({
      outerHostId,
      innerHostId,
      markup,
    }: {
      outerHostId: string
      innerHostId: string
      markup: string
    }) => {
      const outerHost = document.createElement("div")
      outerHost.id = outerHostId
      const outerRoot = outerHost.attachShadow({ mode: "open" })
      const innerHost = document.createElement("div")
      innerHost.id = innerHostId
      outerRoot.appendChild(innerHost)
      const innerRoot = innerHost.attachShadow({ mode: "open" })
      innerRoot.innerHTML = markup
      const anchor = document.getElementById("host-anchor")
      if (anchor === null) throw new Error("fixture missing #host-anchor")
      anchor.appendChild(outerHost)
    },
    { outerHostId, innerHostId, markup: WITNESS_MARKUP }
  )
}

export type ShadowCarrierReading = {
  readonly repairKey: string | null
  readonly verdict: string | null
  readonly color: string
  readonly backdrop: string
}

/**
 * Reads one carrier inside `hostId`'s open root: its rendered foreground and
 * the first opaque background at or above it, crossing the shadow boundary
 * through `host` as `resolveEffectiveBackdrop` does. Deliberately naive
 * otherwise (no hazards, no alpha compositing).
 *
 * `hostPath` names the chain of host ids to descend through.
 */
export async function readShadowCarrier(
  page: Page,
  hostPath: ReadonlyArray<string>,
  carrierClass: string
): Promise<ShadowCarrierReading> {
  return page.evaluate(
    ({
      hostPath,
      carrierClass,
    }: {
      hostPath: ReadonlyArray<string>
      carrierClass: string
    }) => {
      let root: Document | ShadowRoot = document
      for (const id of hostPath) {
        const host: Element | null =
          root instanceof Document
            ? root.getElementById(id)
            : root.getElementById(id)
        if (host === null) throw new Error(`host #${id} missing`)
        if (host.shadowRoot === null) throw new Error(`#${id} has no open root`)
        root = host.shadowRoot
      }
      const el = root.querySelector(`.${carrierClass}`)
      if (el === null) throw new Error(`carrier .${carrierClass} missing`)

      let backdrop = "rgb(255, 255, 255)"
      let cur: Element | null = el
      while (cur !== null) {
        const bg = getComputedStyle(cur).backgroundColor
        if (bg.startsWith("rgb(")) {
          backdrop = bg
          break
        }
        const parent: Element | null = cur.parentElement
        if (parent !== null) {
          cur = parent
          continue
        }
        const node: Node | null = cur.parentNode
        cur = node !== null && node instanceof ShadowRoot ? node.host : null
      }

      return {
        repairKey: el.getAttribute("data-sw-legibility-fix"),
        verdict: el.getAttribute("data-sw-legibility"),
        color: getComputedStyle(el).color,
        backdrop,
      }
    },
    { hostPath, carrierClass }
  )
}

/** Resolves once `hostId`'s own scope has committed — its surface's `data-sw-patched` tag is the observable signal (`shadow-scope-theming.ts`'s two-phase handoff sets it only once the realization is fully installed). */
export async function waitForShadowScopeCommitted(
  page: Page,
  hostPath: ReadonlyArray<string>
): Promise<void> {
  await page.waitForFunction(
    (path: ReadonlyArray<string>) => {
      let root: Document | ShadowRoot = document
      for (const id of path) {
        const host: Element | null = root.getElementById(id)
        if (host?.shadowRoot === null || host?.shadowRoot === undefined) {
          return false
        }
        root = host.shadowRoot
      }
      return (
        root
          .querySelector(".sf-rc3-surface")
          ?.hasAttribute("data-sw-patched") === true
      )
    },
    hostPath,
    { timeout: 5_000, polling: 100 }
  )
}

/**
 * A carrier inside a *nested* root whose ancestors are all transparent, so
 * its backdrop resolves in the **outer** scope.
 *
 * `registerShadowRoot` recurses into nested roots before `onScopeReady` for
 * the parent, so this scope is audited first, against the outer surface's
 * still-native white, and no observer here sees the outer darkening. Without
 * `recontrastDescendants` the carrier stays dark on a dark surface.
 *
 * Distinct from `mountNestedShadowWitnesses`, whose inner root owns its own
 * surface and so passes either way.
 */
export async function mountNestedBackdropCrosser(
  page: Page,
  outerHostId: string,
  innerHostId: string
): Promise<void> {
  await page.evaluate(
    ({
      outerHostId,
      innerHostId,
    }: {
      outerHostId: string
      innerHostId: string
    }) => {
      const outerHost = document.createElement("div")
      outerHost.id = outerHostId
      const outerRoot = outerHost.attachShadow({ mode: "open" })

      // The outer scope's own light surface — what this carrier's backdrop
      // will resolve to once it is themed.
      const surface = document.createElement("div")
      surface.className = "sf-rc3-surface"
      surface.setAttribute(
        "style",
        "margin:0;padding:16px;background-color:rgb(255,255,255)"
      )

      const innerHost = document.createElement("div")
      innerHost.id = innerHostId
      surface.appendChild(innerHost)
      outerRoot.appendChild(surface)

      // Nothing inside the inner root owns a background, so the backdrop
      // walk leaves it entirely.
      const innerRoot = innerHost.attachShadow({ mode: "open" })
      const carrier = document.createElement("div")
      carrier.className = "sf-rc3-crosser"
      carrier.setAttribute("style", "color:rgb(0,0,0)")
      carrier.textContent =
        "A carrier that resolves its backdrop one scope out."
      innerRoot.appendChild(carrier)

      const anchor = document.getElementById("host-anchor")
      if (anchor === null) throw new Error("fixture missing #host-anchor")
      anchor.appendChild(outerHost)
    },
    { outerHostId, innerHostId }
  )
}

/** Drives one genuine vendor mutation inside `hostId`'s own root, the trigger a reconcile round needs. */
export async function mutateInsideShadowScope(
  page: Page,
  hostId: string
): Promise<void> {
  await page.evaluate((id: string) => {
    const root = document.getElementById(id)?.shadowRoot
    if (root === null || root === undefined) {
      throw new Error(`#${id} has no open root`)
    }
    const late = document.createElement("p")
    late.textContent = "late content"
    root.appendChild(late)
  }, hostId)
}

/**
 * The same cross-scope dependency one level out: the stale ancestor is the
 * **document**.
 *
 * Created in one synchronous batch on purpose. Discovery projects this scope
 * immediately, against a still-white light-DOM ancestor, while the document
 * round waits out its debounce and then darkens that ancestor — a
 * `data-sw-patched` write no observer of this root sees. Without a
 * document-driven re-contrast nothing re-audits the carrier.
 *
 * Neither carrier nor host owns a background, so the backdrop resolves on
 * the light-DOM ancestor.
 */
export async function mountDocumentBackdropCrosser(
  page: Page,
  ancestorId: string,
  hostId: string
): Promise<void> {
  await page.evaluate(
    ({ ancestorId, hostId }: { ancestorId: string; hostId: string }) => {
      const anchor = document.getElementById("host-anchor")
      if (anchor === null) throw new Error("fixture missing #host-anchor")

      const ancestor = document.createElement("div")
      ancestor.id = ancestorId
      ancestor.setAttribute(
        "style",
        "margin:0;padding:16px;background-color:rgb(255,255,255)"
      )

      const host = document.createElement("div")
      host.id = hostId
      const root = host.attachShadow({ mode: "open" })
      const carrier = document.createElement("div")
      carrier.className = "sf-rc3-crosser"
      carrier.setAttribute("style", "color:rgb(0,0,0)")
      carrier.textContent =
        "A carrier that resolves its backdrop to the document."
      root.appendChild(carrier)

      ancestor.appendChild(host)
      anchor.appendChild(ancestor)
    },
    { ancestorId, hostId }
  )
}

/**
 * The transition hazard on the *backdrop* channel: the surface has an
 * authored `transition` on `background-color`, so the audit, running in the
 * same task as the darkening, would read the start value (white) unless
 * frozen — no repair, and an unreadable carrier once it lands.
 *
 * 2s, deliberately long, so a slow round cannot land after it settled and
 * pass vacuously.
 */
export async function mountTransitioningBackdropScope(
  page: Page,
  hostId: string
): Promise<void> {
  await page.evaluate((id: string) => {
    const host = document.createElement("div")
    host.id = id
    const root = host.attachShadow({ mode: "open" })
    const surface = document.createElement("div")
    surface.className = "sf-rc3-surface"
    surface.setAttribute(
      "style",
      "margin:0;padding:16px;background-color:rgb(255,255,255);" +
        "transition:background-color 2s linear"
    )
    const carrier = document.createElement("div")
    carrier.className = "sf-rc3-crosser"
    carrier.setAttribute("style", "color:rgb(0,0,0)")
    carrier.textContent =
      "Text over a surface whose background is transitioning."
    surface.appendChild(carrier)
    root.appendChild(surface)
    const anchor = document.getElementById("host-anchor")
    if (anchor === null) throw new Error("fixture missing #host-anchor")
    anchor.appendChild(host)
  }, hostId)
}

/** The same backdrop-transition hazard in the light DOM, where `fire()` has audited right after `realize()` since SF-RC1 — the document half of the one freeze rule that closes both. */
export async function mountTransitioningDocumentRegion(
  page: Page,
  regionId: string,
  carrierId: string
): Promise<void> {
  await page.evaluate(
    ({ regionId, carrierId }: { regionId: string; carrierId: string }) => {
      const region = document.createElement("div")
      region.id = regionId
      region.setAttribute(
        "style",
        "margin:0;padding:16px;background-color:rgb(250,250,250);" +
          "transition:background-color 2s linear"
      )
      const carrier = document.createElement("div")
      carrier.id = carrierId
      carrier.setAttribute("style", "color:rgb(0,0,0)")
      carrier.textContent = "Light-DOM text over a transitioning background."
      region.appendChild(carrier)
      const anchor = document.getElementById("host-anchor")
      if (anchor === null) throw new Error("fixture missing #host-anchor")
      anchor.appendChild(region)
    },
    { regionId, carrierId }
  )
}
