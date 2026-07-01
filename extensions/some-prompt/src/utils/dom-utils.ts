import type { ElementInfo } from "@prompt/types/storage"

export class DOMUtils {
  static isInputElement(element: Element): boolean {
    if (!element?.tagName) return false

    const tagName = element.tagName.toLowerCase()

    // Check for input elements, but exclude non-text types
    if (tagName === "input") {
      const inputElement = element as HTMLInputElement
      const inputType = (inputElement.type || "text").toLowerCase()
      const textInputTypes = [
        "text",
        "search",
        "url",
        "email",
        "password",
        "tel",
      ]
      return textInputTypes.includes(inputType)
    }

    // Check for textarea elements
    if (tagName === "textarea") {
      return true
    }

    // Check for contenteditable elements
    const htmlElement = element as HTMLElement
    if (htmlElement.contentEditable === "true") {
      return true
    }

    return false
  }

  static getElementText(element: Element): string {
    if (!element) return ""

    const tagName = element.tagName.toLowerCase()

    if (tagName === "input" || tagName === "textarea") {
      const inputElement = element as HTMLInputElement | HTMLTextAreaElement
      return inputElement.value || ""
    }

    const htmlElement = element as HTMLElement
    if (htmlElement.contentEditable === "true") {
      return htmlElement.textContent || ""
    }

    return ""
  }

  static getElementInfo(element: Element): ElementInfo {
    const htmlElement = element as HTMLElement
    const inputElement = element as HTMLInputElement

    const elementInfo: ElementInfo = {
      tagName: element.tagName.toLowerCase(),
      type: inputElement.type || null,
      id: htmlElement.id || null,
      name: inputElement.name || null,
      className: htmlElement.className || null,
      placeholder: inputElement.placeholder || null,
    }

    // For contenteditable, get some context
    if (htmlElement.contentEditable === "true") {
      elementInfo.contentEditable = true
      elementInfo.type = "contenteditable"
    }

    // Try to get form context if element is in a form
    const form = htmlElement.closest("form")
    if (form) {
      elementInfo.formAction = form.action || null
      elementInfo.formMethod = form.method || null
      elementInfo.formId = form.id || null
    }

    return elementInfo
  }
}
