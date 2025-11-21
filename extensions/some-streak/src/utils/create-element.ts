/**
 * Utility function to create DOM elements with attributes and children
 */

type CreateElementOptions = {
  className?: string
  attributes?: Record<string, string>
  styles?: Partial<CSSStyleDeclaration>
  children?: Array<HTMLElement | string | null>
}

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  { className, attributes, styles, children }: CreateElementOptions = {}
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)

  if (className) {
    element.className = className
  }

  if (attributes) {
    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, value)
    })
  }

  if (styles) {
    Object.assign(element.style, styles)
  }

  if (children) {
    children.forEach((child) => {
      if (child === null) return
      if (typeof child === "string") {
        element.appendChild(document.createTextNode(child))
      } else {
        element.appendChild(child)
      }
    })
  }

  return element
}

/**
 * Create an SVG element with attributes
 */
export function createSVGElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes?: Record<string, string>
): SVGElementTagNameMap[K] {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag)

  if (attributes) {
    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, value)
    })
  }

  return element
}
