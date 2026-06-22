/**
 * Minimal element helper shared by the conveyor view components. Pure DOM, no
 * I/O — keeps the (props) => HTMLElement views terse without a framework.
 */
export function el(tag: string, cls = ""): HTMLElement {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  return node
}

/** Element with text content in one call. */
export function elText(tag: string, text: string, cls = ""): HTMLElement {
  const node = el(tag, cls)
  node.textContent = text
  return node
}
