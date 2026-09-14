/**
 * SF-RC3 (#1342) shadow-scope drivers for the rendered-contrast channel —
 * the shadow-DOM counterpart to `legibility-repair-page.html`'s own three
 * regions, built from the spec rather than baked into a fixture for the
 * same reason `shadow-traces.ts` does it that way: each scope's creation
 * timing relative to classification stays fully controlled by the test,
 * never raced against a fixture's own load sequence.
 *
 * Every surface below is deliberately in **normal flow**, not
 * `position: fixed` the way `shadow-traces.ts`'s own surfaces are. That is
 * load-bearing here, not a style preference: `resolveEffectiveBackdrop`
 * (`legibility-audit.ts`) treats any non-`static` ancestor as a positioning
 * hazard and returns `"underdetermined"` for everything beneath it — a
 * carrier under a `position: fixed` surface is never a repair candidate at
 * all, so a fixture built that way would pass vacuously.
 *
 * No assertion lives here; see `issue-1342-sfrc3-shadow-foreground.spec.ts`.
 */

import type { Page } from "@playwright/test"

/**
 * The two Gate-0 witnesses (#1338) reproduced inside one open shadow root,
 * on the identical shapes `legibility-repair-page.html` uses at document
 * scope:
 *
 *   - `<hostId>` + `chip` — escape route 2, explicit-colour-equals-computed-
 *     parent: the button repeats the colour its surface parent declares and
 *     owns no background of its own, so the co-located (#741) `textCss` fix
 *     that lands on the *surface* is overridden by the button's own
 *     declaration and no per-surface action can ever name the button.
 *   - `<hostId>` + `label` — escape route 1, own explicit colour with no own
 *     background: never enters the per-surface hypothesis under any
 *     classification.
 *
 * Plus `transitioned`: witness B's shape with a vendor `transition` on
 * `color`, the hazard `legibility-audit.ts`'s own scope freeze exists for.
 * Its colour differs from `label`'s so it resolves to its own
 * `LegibilityKey` and its repair can be asserted independently.
 *
 * The surface owns a light background, so the scope themes rather than
 * reading as already-dark, and both carriers are left dark-on-dark by
 * everything except SF-RC2's own alphabet.
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
 * The same witnesses, two shadow levels deep (#1342's own acceptance
 * criterion, matching the epic's G0.7 fixture shape): an open root whose
 * only content is a host for a second open root.
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
 * Reads one carrier inside `hostId`'s own open root: its rendered
 * foreground and the first opaque background at or above it. The walk
 * crosses the shadow boundary through `host` exactly the way
 * `resolveEffectiveBackdrop` itself does — kept deliberately naive
 * otherwise (no hazard handling, no alpha compositing) so the fixture, not
 * the measurement, is what has to stay simple.
 *
 * `hostPath` names the chain of host ids to descend through, so one reader
 * serves both the one-level and the nested-two-levels cases.
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
 * Codex review round 1 on #1412's own regression shape: a carrier inside a
 * *nested* root whose own ancestors are all transparent, so
 * `resolveEffectiveBackdrop` climbs out through `ShadowRoot.host` and
 * resolves its backdrop in the **outer** scope.
 *
 * `shadow-scope-discovery.ts`'s `registerShadowRoot` recurses into nested
 * roots before calling `onScopeReady` for the parent, so this carrier's own
 * scope is audited first, against the outer surface's still-native white —
 * and nothing the outer scope's later darkening does is visible to any
 * observer watching this root. Without `recontrastDescendants` the carrier
 * keeps its authored dark colour on a newly dark surface, permanently.
 *
 * Deliberately distinct from `mountNestedShadowWitnesses`, whose inner root
 * owns its own opaque surface and therefore resolves entirely within itself
 * — that fixture passes either way, which is exactly why it did not catch
 * this.
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
 * Codex review round 2 on #1412: the same cross-scope backdrop dependency
 * one level further out, where the stale ancestor is the **document**
 * rather than an outer shadow scope.
 *
 * Everything is created in one synchronous batch on purpose, and the timing
 * that follows is the whole point. The light-DOM ancestor is still native
 * white when the batch lands; the top-level discovery observer registers
 * this host and projects its scope immediately, while the document
 * pipeline's own round waits out `RECONCILE_POLICY`'s debounce first. So
 * the scope audits its carrier against white — legible, no repair — and
 * the document round then tags and darkens that same ancestor. The
 * `data-sw-patched` write that does it is outside this host observer's own
 * `class`/`style` filter and is not a mutation inside this root at all, so
 * without a document-driven re-contrast nothing ever re-audits the carrier.
 *
 * The carrier owns no background and neither does its host, so
 * `resolveEffectiveBackdrop` walks straight out of the shadow tree and
 * lands on the light-DOM ancestor.
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
 * Codex review round 3 on #1412: the transition hazard on the *backdrop*
 * channel rather than the foreground one.
 *
 * The surface owns an authored `transition` on `background-color`, so
 * darkening it starts a transition — and the audit runs immediately
 * afterwards, in the same task, so `resolveEffectiveBackdrop` reads that
 * transition's start value (still native white) unless it is frozen first.
 * A carrier scored against white is legible, gets no repair, and turns
 * unreadable when the transition lands, with no mutation left to schedule
 * another round.
 *
 * 2s, deliberately long: the failure is a read taken at progress ~0, and a
 * short transition would let a slow round land after it had already settled
 * and pass vacuously.
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
