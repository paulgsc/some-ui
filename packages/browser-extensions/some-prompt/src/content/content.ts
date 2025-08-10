import { Overlay } from "@prompt/components/overlay"
import { StorageService } from "@prompt/services/storage"
import { TextProcessor } from "@prompt/services/text-processor"
import type {
  BackgroundMessage,
  ExtensionSettings,
  UtterancePayload,
} from "@prompt/types/storage"
import { DOMUtils } from "@prompt/utils/dom-utils"

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
