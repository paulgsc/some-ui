/**
 * A mark as drawn, its colours and its labels left out (`class` and every
 * `data-*` attribute, on it and inside it), so two marks compare by form
 * alone: what "no two states share a mark" (#2148) holds.
 */
export function markForm(mark: Element | null): string {
  if (mark === null) throw new Error("no mark")
  const copy = mark.cloneNode(true)
  if (!(copy instanceof Element)) throw new Error("no mark")
  for (const el of [copy, ...copy.querySelectorAll("*")]) {
    for (const name of el.getAttributeNames()) {
      if (name === "class" || name.startsWith("data-")) el.removeAttribute(name)
    }
  }
  return copy.outerHTML
}
