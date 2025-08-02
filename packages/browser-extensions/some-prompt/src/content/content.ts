type UtterancePayload = {
  text: string
  metadata: UtteranceMetadata
}

type UtteranceMetadata = {
  url: string
  domain: string
  title: string
  timestamp: string
  element: ElementInfo | null
}

type ElementInfo = {
  tagName: string
  type: string | null
  id: string | null
  name: string | null
  className: string | null
  placeholder: string | null
  contentEditable?: boolean
  formAction?: string | null
  formMethod?: string | null
  formId?: string | null
}

type BackgroundMessage = {
  type: "POST_UTTERANCE" | "GET_SETTINGS" | "UPDATE_SETTINGS"
  payload?: any
}

export class DOMUtils {
  static isInputElement(element: Element): boolean {
    if (!element || !element.tagName) return false

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

type ExtensionSettings = {
  enabled: boolean
  maxUtteranceLength: number
  minUtteranceLength: number
  serverUrl: string
  postThrottleMs: number
}

const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  maxUtteranceLength: 200,
  minUtteranceLength: 3,
  serverUrl: "http://nixos.local:3000/utter",
  postThrottleMs: 500,
}

export class StorageService {
  static async getSettings(): Promise<ExtensionSettings> {
    try {
      const result = await chrome.storage.sync.get("settings")
      return { ...DEFAULT_SETTINGS, ...result.settings }
    } catch (error) {
      console.warn("Failed to load settings, using defaults:", error)
      return DEFAULT_SETTINGS
    }
  }

  static async updateSettings(
    settings: Partial<ExtensionSettings>
  ): Promise<void> {
    try {
      const currentSettings = await this.getSettings()
      const newSettings = { ...currentSettings, ...settings }
      await chrome.storage.sync.set({ settings: newSettings })
    } catch (error) {
      console.error("Failed to save settings:", error)
      throw error
    }
  }

  static async resetSettings(): Promise<void> {
    try {
      await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS })
    } catch (error) {
      console.error("Failed to reset settings:", error)
      throw error
    }
  }

  static onSettingsChanged(
    callback: (settings: ExtensionSettings) => void
  ): void {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === "sync" && changes.settings) {
        callback(changes.settings.newValue)
      }
    })
  }
}

export class Overlay {
  private element: HTMLDivElement
  private isVisible: boolean = true

  constructor() {
    this.element = this.createElement()
    this.appendToBody()
  }

  private createElement(): HTMLDivElement {
    const overlay = document.createElement("div")
    overlay.id = "typing-mirror-overlay"
    overlay.className = "typing-mirror-overlay"
    overlay.innerHTML = "<em>Start typing...</em>"

    // Apply Tailwind styles programmatically
    Object.assign(overlay.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      maxWidth: "300px",
      maxHeight: "200px",
      background: "rgba(0, 0, 0, 0.8)",
      color: "#00ff00",
      fontFamily: '"Courier New", "Monaco", "Consolas", monospace',
      fontSize: "12px",
      padding: "10px",
      borderRadius: "5px",
      border: "1px solid rgba(255, 255, 255, 0.3)",
      zIndex: "999999",
      pointerEvents: "none",
      wordWrap: "break-word",
      overflowY: "auto",
      whiteSpace: "pre-wrap",
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
      backdropFilter: "blur(2px)",
      display: "none",
      transition: "opacity 0.2s ease-in-out",
      opacity: "0",
    })

    return overlay
  }

  private appendToBody(): void {
    document.body.appendChild(this.element)
  }

  updateContent(text: string): void {
    if (text.trim()) {
      this.element.textContent = text
    } else {
      this.element.innerHTML = "<em>Start typing...</em>"
    }
  }

  show(): void {
    if (!this.isVisible) return

    this.element.style.display = "block"
    // Force reflow
    this.element.offsetHeight
    this.element.style.opacity = "1"
  }

  hide(): void {
    this.element.style.opacity = "0"
    setTimeout(() => {
      this.element.style.display = "none"
    }, 200)
  }

  toggle(): void {
    this.isVisible = !this.isVisible

    if (this.isVisible) {
      this.show()
    } else {
      this.hide()
    }
  }

  setVisibility(visible: boolean): void {
    this.isVisible = visible

    if (visible) {
      this.show()
    } else {
      this.hide()
    }
  }

  destroy(): void {
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element)
    }
  }
}

export class TextProcessor {
  /**
   * Prepares text for TTS utterance with smart sentence-aware truncation
   * Phase 1: Lazy but solid - avoids nonsense output with minimal effort
   */
  static prepareTextForUtterance(
    text: string,
    maxWords: number = 100,
    minWords: number = 2
  ): string | null {
    if (!text || typeof text !== "string") return null

    const cleanText = text.trim()

    // Skip if no alphanumeric content (avoid TTS garbage)
    if (!/[a-zA-Z0-9]/.test(cleanText)) return null

    const words = cleanText.split(/\s+/)

    // Skip if too few words for meaningful utterance
    if (words.length < minWords) return null

    // If text is within reasonable word count, return as-is
    if (words.length <= maxWords) return cleanText

    // Smart truncation: try to end at sentence boundary
    return this.truncateTextSmart(cleanText, maxWords)
  }

  /**
   * Smart truncation that respects sentence boundaries
   * Prioritizes complete sentences over word limits
   */
  private static truncateTextSmart(text: string, maxWords: number): string {
    const words = text.split(/\s+/)

    // If we're close to the limit, just take it all
    if (words.length <= maxWords + 5) return text

    // Try to find the last complete sentence within our word limit
    const truncatedWords = words.slice(0, maxWords)
    const truncatedText = truncatedWords.join(" ")

    // Look for sentence endings (. ! ?) working backwards
    const sentenceEnders = /[.!?]/g
    let lastSentenceEnd = -1
    let match

    while ((match = sentenceEnders.exec(truncatedText)) !== null) {
      lastSentenceEnd = match.index
    }

    // If we found a sentence boundary and it's not too early, use it
    if (lastSentenceEnd > -1) {
      const sentenceText = truncatedText.slice(0, lastSentenceEnd + 1).trim()
      const sentenceWordCount = sentenceText.split(/\s+/).length

      // Only use sentence boundary if it's at least 50% of our target
      if (sentenceWordCount >= maxWords * 0.5) {
        return sentenceText
      }
    }

    // Fallback: truncate at word boundary (natural behavior now)
    return truncatedWords.join(" ").trim() + "..."
  }

  /**
   * Phase 2 preparation: Break text into sentence chunks for streaming
   * Call this when you're ready to implement queued TTS
   */
  static breakIntoSentences(
    text: string,
    maxWordsPerSentence: number = 15
  ): Array<string> {
    if (!text || typeof text !== "string") return []

    // Simple sentence splitting (can be enhanced later with NLP)
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && /[a-zA-Z0-9]/.test(s))

    // Split overly long sentences at word boundaries
    const result: Array<string> = []
    for (const sentence of sentences) {
      const words = sentence.split(/\s+/)
      if (words.length <= maxWordsPerSentence) {
        result.push(sentence)
      } else {
        // Break long sentences into chunks
        for (let i = 0; i < words.length; i += maxWordsPerSentence) {
          const chunk = words.slice(i, i + maxWordsPerSentence).join(" ")
          result.push(chunk)
        }
      }
    }

    return result
  }

  /**
   * Utility: Check if text is worth speaking (has meaningful content)
   */
  static isWorthSpeaking(text: string, minWords: number = 2): boolean {
    if (!text || typeof text !== "string") return false

    const cleanText = text.trim()
    if (cleanText.length < 1) return false

    // Must have alphanumeric content
    if (!/[a-zA-Z0-9]/.test(cleanText)) return false

    // Should have minimum word count
    const wordCount = cleanText
      .split(/\s+/)
      .filter((word) => word.length > 0).length
    return wordCount >= minWords
  }
}

class TypingMirror {
  private currentText = ""
  private currentElement: Element | null = null
  private overlay: Overlay
  private lastPostTime = 0
  private settings: ExtensionSettings

  constructor() {
    this.overlay = new Overlay()
    this.settings = {
      enabled: true,
      maxUtteranceLength: 200,
      minUtteranceLength: 3,
      serverUrl: "http://nixos.local:3000/utter",
      postThrottleMs: 500,
    }

    this.init()
  }

  private async init(): Promise<void> {
    await this.loadSettings()
    this.setupEventListeners()
    this.setupHotkey()
    this.setupSettingsListener()
  }

  private async loadSettings(): Promise<void> {
    try {
      this.settings = await StorageService.getSettings()
      this.overlay.setVisibility(this.settings.enabled)
    } catch (error) {
      console.warn("Failed to load settings:", error)
    }
  }

  private setupSettingsListener(): void {
    StorageService.onSettingsChanged((newSettings) => {
      this.settings = newSettings
      this.overlay.setVisibility(newSettings.enabled)
    })
  }

  private setupEventListeners(): void {
    document.addEventListener("focusin", this.handleFocusIn.bind(this), true)
    document.addEventListener("focusout", this.handleFocusOut.bind(this), true)
    document.addEventListener("input", this.handleInput.bind(this), true)
    document.addEventListener("keydown", this.handleKeyDown.bind(this), true)
  }

  private setupHotkey(): void {
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === "U") {
        e.preventDefault()
        this.overlay.toggle()
      }
    })
  }

  private handleFocusIn(e: Event): void {
    const element = e.target as Element

    if (DOMUtils.isInputElement(element)) {
      this.currentElement = element
      this.currentText = DOMUtils.getElementText(element)
      this.overlay.updateContent(this.currentText)
      if (this.settings.enabled) {
        this.overlay.show()
      }
    }
  }

  private handleFocusOut(e: Event): void {
    const element = e.target as Element

    if (DOMUtils.isInputElement(element)) {
      this.currentElement = null
      this.currentText = ""
      this.overlay.hide()
    }
  }

  private handleInput(e: Event): void {
    const element = e.target as Element

    if (DOMUtils.isInputElement(element) && element === this.currentElement) {
      this.currentText = DOMUtils.getElementText(element)
      this.overlay.updateContent(this.currentText)
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (
      e.key === "Enter" &&
      this.currentElement &&
      DOMUtils.isInputElement(this.currentElement)
    ) {
      // Check if it's a textarea and not using Shift+Enter
      if (
        this.currentElement.tagName.toLowerCase() === "textarea" &&
        !e.shiftKey
      ) {
        return
      }

      const utteranceText = TextProcessor.prepareTextForUtterance(
        this.currentText,
        this.settings.maxUtteranceLength,
        this.settings.minUtteranceLength
      )

      if (utteranceText && this.shouldPost()) {
        if (this.currentElement.tagName.toLowerCase() === "input") {
          e.preventDefault()
        }
        this.postText(utteranceText)
      }
    }
  }

  private shouldPost(): boolean {
    if (!this.settings.enabled) return false

    const now = Date.now()
    return now - this.lastPostTime >= this.settings.postThrottleMs
  }

  private getMetadata() {
    const metadata = {
      url: window.location.href,
      domain: window.location.hostname,
      title: document.title,
      timestamp: new Date().toISOString(),
      element: this.currentElement
        ? DOMUtils.getElementInfo(this.currentElement)
        : null,
    }

    return metadata
  }

  private async postText(text: string): Promise<void> {
    const utteranceText = TextProcessor.prepareTextForUtterance(
      text,
      this.settings.maxUtteranceLength,
      this.settings.minUtteranceLength
    )

    if (!utteranceText) return

    this.lastPostTime = Date.now()

    try {
      const payload: UtterancePayload = {
        text: utteranceText,
        metadata: this.getMetadata(),
      }

      const message: BackgroundMessage = {
        type: "POST_UTTERANCE",
        payload,
      }

      const response = await chrome.runtime.sendMessage(message)

      if (response?.success) {
        console.log("Text posted successfully:", payload)
      } else {
        console.warn("Failed to post text:", response)
      }
    } catch (error) {
      console.warn("Error communicating with background script:", error)
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => new TypingMirror())
} else {
  new TypingMirror()
}
