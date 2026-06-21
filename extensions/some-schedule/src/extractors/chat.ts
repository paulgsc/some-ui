/**
 *
 * Extracts structured content from AI chat session tabs.
 *
 * Targets: claude.ai/chat/*, chatgpt.com/c/*
 *
 * The challenge: same URL structure hosts wildly different sessions.
 * A claude.ai tab might be a rust-jit-tutor session or a completely
 * unrelated conversation. The domain will always be 'unknown' from
 * the classifier — the CRM lets the user override.
 *
 * What we extract:
 * - First user message (usually reveals the session topic)
 * - First assistant response heading or first sentence
 * - Any skill file markers visible in the page text
 */

import type { ExtractedContent } from "@schedule/shared/types"

import type { Extractor, ExtractResult } from "./base"
import { rawLength, truncate } from "./base"

export class ChatExtractor implements Extractor {
  name = "chat"

  matches(url: string): boolean {
    return /claude\.ai\/chat\/|chatgpt\.com\/(c|chat)\//.test(url)
  }

  async extract(): Promise<ExtractResult> {
    try {
      const content = this.extractContent()
      return { ok: true, content }
    } catch (e) {
      return {
        ok: false,
        error: String(e),
        content: fallback(),
      }
    }
  }

  private extractContent(): ExtractedContent {
    const isClaude = /claude\.ai/.test(window.location.href)

    // First user message — the most reliable signal for what this session is about
    const userMsgEl = isClaude
      ? document.querySelector('[data-testid="user-message"]')
      : document.querySelector('[data-message-author-role="user"]')

    const firstUserMsg = userMsgEl?.textContent?.trim() ?? ""

    // First assistant response — extract its first paragraph or heading
    const assistantMsgEl = isClaude
      ? document.querySelectorAll('[data-testid="assistant-message"]')[0]
      : document.querySelectorAll('[data-message-author-role="assistant"]')[0]

    const firstAssistantHeading =
      assistantMsgEl
        ?.querySelector("h1, h2, h3, strong")
        ?.textContent?.trim() ?? ""
    const firstAssistantPara =
      assistantMsgEl?.querySelector("p")?.textContent?.trim() ?? ""

    // Skill file markers — skill files often start with a distinctive header
    // like "# rust-jit-tutor" or "SKILL:" in the rendered content
    const allText = document.body.innerText
    const skillMatch = allText.match(/(?:skill|tutor|session)[:\s]+([^\n]+)/i)
    const skillHint = skillMatch?.[1]?.trim() ?? ""

    // Title: try page title, fall back to first user message
    const pageTitle = document.title
      .replace("Claude", "")
      .replace("ChatGPT", "")
      .trim()
    const title = pageTitle || truncate(firstUserMsg, 60) || "Chat session"

    const summaryParts = [
      firstUserMsg ? `User: ${firstUserMsg}` : "",
      firstAssistantHeading || firstAssistantPara,
    ].filter(Boolean)

    return {
      kind: "chat",
      title,
      summary: truncate(summaryParts.join(" | "), 500),
      headings: [firstAssistantHeading].filter(Boolean),
      keywords: skillHint ? [skillHint.toLowerCase().replace(/\s+/g, "-")] : [],
      raw_length: rawLength(),
      meta: {
        platform: isClaude ? "claude" : "chatgpt",
        skill_hint: skillHint,
        has_user_message: Boolean(firstUserMsg),
      },
    }
  }
}

function fallback(): ExtractedContent {
  return {
    kind: "chat",
    title: document.title,
    summary: "",
    headings: [],
    keywords: [],
    raw_length: rawLength(),
    meta: { fallback: true },
  }
}
