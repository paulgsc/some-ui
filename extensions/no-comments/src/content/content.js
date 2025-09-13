;(function () {
  "use strict"

  console.log("🚀 GitHub Comment Remover loaded")
  if (typeof browser !== "undefined" && !window.chrome) {
    window.chrome = browser
  }

  let commentsHidden = false
  let originalContent = new Map() // Store original content for restoration

  // Check if we're on a code view page
  function isCodePage() {
    const found =
      document.querySelector(
        '.js-file-content, .blob-wrapper, .highlight, textarea[data-testid="read-only-cursor-text-area"]'
      ) !== null
    console.log("🔍 isCodePage:", found)
    console.log("🔍 URL:", window.location.href)
    return found
  }

  // Check if a line is a comment (Rust-focused)
  function isCommentLine(line) {
    const trimmed = line.trim()

    // Empty lines
    if (trimmed === "") return false

    // Single line comments
    if (trimmed.startsWith("//") || trimmed.startsWith("///")) return true

    // Multi-line comment start
    if (trimmed.startsWith("/*") || trimmed.startsWith("/**")) return true

    // Multi-line comment end
    if (trimmed.endsWith("*/")) return true

    // Lines that are continuation of multi-line comments
    if (/^\s*\*/.test(trimmed)) return true

    return false
  }

  // Remove comment lines from text content
  function removeCommentLines(text) {
    const lines = text.split("\n")
    let inMultiLineComment = false
    const filteredLines = []

    for (let line of lines) {
      const trimmed = line.trim()

      // Check if we're entering a multi-line comment
      if (trimmed.includes("/*")) {
        inMultiLineComment = true
      }

      // Skip comment lines
      if (inMultiLineComment || isCommentLine(line)) {
        // Check if this line ends the multi-line comment
        if (trimmed.includes("*/")) {
          inMultiLineComment = false
        }
        continue
      }

      filteredLines.push(line)
    }

    return filteredLines.join("\n")
  }

  // Process textareas containing code
  function processTextareas() {
    console.log("📝 Processing textareas...")
    if (!isCodePage()) {
      console.log("❌ Not on code page, skipping textarea processing")
      return
    }

    // Find all textareas that might contain code
    const textareas = document.querySelectorAll(`
                                                textarea[data-testid="read-only-cursor-text-area"],
                                                            textarea.react-blob-textarea,
                                                            textarea[class*="blob"],
                                                            textarea[readonly]
                                              `)

    console.log("📝 Found textareas:", textareas.length)
    textareas.forEach((textarea, index) => {
      console.log(`📝 Textarea ${index}:`, textarea.className, textarea.dataset)
    })

    textareas.forEach((textarea) => {
      if (textarea.dataset.commentProcessed) {
        console.log("📝 Textarea already processed, skipping")
        return
      }

      const content = textarea.value
      console.log("📝 Textarea content length:", content ? content.length : 0)
      if (!content) return

      // Store original content
      const textareaId =
        textarea.id || `textarea-${Date.now()}-${Math.random()}`
      if (!textarea.id) textarea.id = textareaId

      originalContent.set(textareaId, content)
      console.log("📝 Stored original content for:", textareaId)

      if (commentsHidden) {
        const filteredContent = removeCommentLines(content)
        console.log("📝 Filtered content length:", filteredContent.length)
        textarea.value = filteredContent
      }

      textarea.dataset.commentProcessed = "true"
    })
  }

  // Also handle pre/code elements for other views
  function processCodeElements() {
    if (!isCodePage()) return

    const codeElements = document.querySelectorAll(`
                                                  .js-file-line,
                                                              .blob-code,
                                                              .blob-code-inner,
                                                              .highlight .line,
                                                              tr[data-line-number]
                                                            `)

    codeElements.forEach((element) => {
      if (element.dataset.commentProcessed) return

      if (isCommentLine(element)) {
        element.dataset.originalDisplay = element.style.display || ""
        if (commentsHidden) {
          element.style.display = "none"
          element.classList.add("comment-hidden")
        }
      }

      element.dataset.commentProcessed = "true"
    })
  }

  // Hide comments
  function hideComments() {
    console.log("🙈 Hiding comments...")
    processTextareas()
    processCodeElements()
    commentsHidden = true
    console.log("🙈 Comments hidden state:", commentsHidden)
  }

  // Show comments (restore original content)
  function showComments() {
    console.log("👁️ Showing comments...")
    // Restore textarea content
    const textareas = document.querySelectorAll(
      "textarea[data-comment-processed]"
    )
    console.log("👁️ Found textareas to restore:", textareas.length)
    textareas.forEach((textarea) => {
      const originalText = originalContent.get(textarea.id)
      console.log(
        "👁️ Restoring textarea:",
        textarea.id,
        "has original:",
        !!originalText
      )
      if (originalText) {
        textarea.value = originalText
      }
      delete textarea.dataset.commentProcessed
    })

    // Restore hidden elements
    const hiddenElements = document.querySelectorAll(".comment-hidden")
    console.log("👁️ Found hidden elements to restore:", hiddenElements.length)
    hiddenElements.forEach((element) => {
      element.style.display = element.dataset.originalDisplay || ""
      element.classList.remove("comment-hidden")
      delete element.dataset.commentProcessed
    })

    commentsHidden = false
    console.log("👁️ Comments hidden state:", commentsHidden)
  }

  // Toggle comment visibility
  function toggleComments() {
    console.log("🔄 Toggling comments, current state:", commentsHidden)
    if (commentsHidden) {
      showComments()
    } else {
      hideComments()
    }
  }

  // Process page
  function processPage() {
    console.log("🔄 Processing page...")
    if (isCodePage()) {
      setTimeout(() => {
        console.log("🔄 Auto-hiding comments after delay")
        hideComments()
      }, 100)
    }
  }

  // Listen for messages from popup
  if (typeof chrome !== "undefined" && chrome.runtime) {
    console.log("🔌 Setting up chrome message listener")
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log("📨 Received message:", request)
      if (request.action === "toggleComments") {
        toggleComments()
        const response = { success: true, hidden: commentsHidden }
        console.log("📨 Sending response:", response)
        sendResponse(response)
      }
    })
  } else {
    console.log("❌ Chrome runtime not available")
  }

  // Auto-process on page load
  console.log("⏰ Setting up auto-process timer")
  setTimeout(processPage, 500)

  // Handle navigation changes (GitHub is a SPA)
  let lastUrl = location.href
  console.log("🔄 Setting up navigation observer for:", lastUrl)
  new MutationObserver(() => {
    const url = location.href
    if (url !== lastUrl) {
      console.log("🔄 Navigation detected:", lastUrl, "->", url)
      lastUrl = url

      // Clear stored content for old page
      originalContent.clear()
      commentsHidden = false

      // Reset processed flags
      document.querySelectorAll("[data-comment-processed]").forEach((el) => {
        delete el.dataset.commentProcessed
      })

      setTimeout(processPage, 1000)
    }
  }).observe(document, { subtree: true, childList: true })

  // Watch for dynamic content loading
  console.log("👀 Setting up content observer")
  new MutationObserver(() => {
    if (isCodePage()) {
      setTimeout(() => {
        console.log("👀 Content changed, reprocessing...")
        processTextareas()
        processCodeElements()
      }, 100)
    }
  }).observe(document.body, { subtree: true, childList: true })

  // Add keyboard shortcut (Ctrl+Shift+C)
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === "C") {
      console.log("⌨️ Keyboard shortcut triggered")
      e.preventDefault()
      toggleComments()
    }
  })

  console.log("✅ GitHub Comment Remover setup complete")
})()
