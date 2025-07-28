
(function() {
        'use strict';

        // State management
        let currentText = '';
        let currentElement = null;
        let overlay = null;
        let isOverlayVisible = true;
        let lastPostTime = 0;
        const POST_THROTTLE_MS = 500;

        // Constants for text processing
        const MAX_UTTERANCE_LENGTH = 200;
        const MIN_UTTERANCE_LENGTH = 3;

        // Clean and prepare text for utterance
        function prepareTextForUtterance(text) {
                if (!text || typeof text !== 'string') return null;

                // Clean up the text
                let cleanText = text.trim();

                // Skip if too short for meaningful utterance
                if (cleanText.length < MIN_UTTERANCE_LENGTH) return null;

                // If text is within reasonable length, return as-is
                if (cleanText.length <= MAX_UTTERANCE_LENGTH) return cleanText;

                // For long text, take the last portion (most recent typing)
                // Try to break at word boundary if possible
                let truncated = cleanText.slice(-MAX_UTTERANCE_LENGTH);

                // Find the first space to avoid cutting words in half
                const firstSpace = truncated.indexOf(' ');
                if (firstSpace > 0 && firstSpace < 50) {
                        truncated = truncated.slice(firstSpace + 1);
                }

                return truncated;
        }

        // Initialize the extension
        function init() {
                createOverlay();
                setupEventListeners();
                setupHotkey();
        }

        // Create the floating overlay
        function createOverlay() {
                overlay = document.createElement('div');
                overlay.id = 'typing-mirror-overlay';
                overlay.innerHTML = '<em>Start typing...</em>';
                document.body.appendChild(overlay);
        }

        // Setup event listeners for input detection
        function setupEventListeners() {
                // Listen for focus events on input elements
                document.addEventListener('focusin', handleFocusIn, true);
                document.addEventListener('focusout', handleFocusOut, true);

                // Listen for input events
                document.addEventListener('input', handleInput, true);

                // Listen for keydown events (for Enter key)
                document.addEventListener('keydown', handleKeyDown, true);
        }

        // Setup hotkey for toggling overlay (Ctrl+Shift+U)
        function setupHotkey() {
                document.addEventListener('keydown', function(e) {
                        if (e.ctrlKey && e.shiftKey && e.key === 'U') {
                                e.preventDefault();
                                toggleOverlay();
                        }
                });
        }

        // Handle focus in events
        function handleFocusIn(e) {
                const element = e.target;

                if (isInputElement(element)) {
                        currentElement = element;
                        currentText = getElementText(element);
                        updateOverlay();
                        showOverlay();
                }
        }

        // Handle focus out events
        function handleFocusOut(e) {
                const element = e.target;

                if (isInputElement(element)) {
                        currentElement = null;
                        currentText = '';
                        hideOverlay();
                }
        }

        // Handle input events
        function handleInput(e) {
                const element = e.target;

                if (isInputElement(element) && element === currentElement) {
                        currentText = getElementText(element);
                        updateOverlay();
                }
        }

        // Handle keydown events
        function handleKeyDown(e) {
                if (e.key === 'Enter' && currentElement && isInputElement(currentElement)) {
                        // Check if it's a textarea and not using Shift+Enter (which should be a new line)
                        if (currentElement.tagName.toLowerCase() === 'textarea' && !e.shiftKey) {
                                return; // Let textarea handle Enter normally
                        }

                        // Prepare text for utterance
                        const utteranceText = prepareTextForUtterance(currentText);

                        // For input fields and contenteditable, or Shift+Enter in textarea
                        if (utteranceText && shouldPost()) {
                                e.preventDefault(); // Prevent default form submission for input fields
                                postText(utteranceText);
                        }
                }
        }

        // Check if element is an input element we care about
        function isInputElement(element) {
                if (!element || !element.tagName) return false;

                const tagName = element.tagName.toLowerCase();

                // Check for input elements, but exclude non-text types
                if (tagName === 'input') {
                        const inputType = (element.type || 'text').toLowerCase();
                        const textInputTypes = ['text', 'search', 'url', 'email', 'password', 'tel'];
                        return textInputTypes.includes(inputType);
                }

                // Check for textarea elements
                if (tagName === 'textarea') {
                        return true;
                }

                // Check for contenteditable elements
                if (element.contentEditable === 'true') {
                        return true;
                }

                return false;
        }

        // Get text content from element
        function getElementText(element) {
                if (!element) return '';

                const tagName = element.tagName.toLowerCase();

                if (tagName === 'input' || tagName === 'textarea') {
                        return element.value || '';
                }

                if (element.contentEditable === 'true') {
                        return element.textContent || '';
                }

                return '';
        }

        // Update overlay content
        function updateOverlay() {
                if (!overlay) return;

                if (currentText.trim()) {
                        overlay.textContent = currentText;
                } else {
                        overlay.innerHTML = '<em>Start typing...</em>';
                }
        }

        // Show overlay
        function showOverlay() {
                if (!overlay || !isOverlayVisible) return;

                overlay.classList.remove('hidden');
                overlay.classList.add('visible');
        }

        // Hide overlay
        function hideOverlay() {
                if (!overlay) return;

                overlay.classList.remove('visible');
                overlay.classList.add('hidden');
        }

        // Toggle overlay visibility
        function toggleOverlay() {
                isOverlayVisible = !isOverlayVisible;

                if (isOverlayVisible && currentElement) {
                        showOverlay();
                } else {
                        hideOverlay();
                }
        }

        // Check if we should post (throttling)
        function shouldPost() {
                const now = Date.now();
                return (now - lastPostTime) >= POST_THROTTLE_MS;
        }

        // Get metadata about the current page and input element
        function getMetadata() {
                const metadata = {
                        url: window.location.href,
                        domain: window.location.hostname,
                        title: document.title,
                        timestamp: new Date().toISOString(),
                        element: null
                };

                // Add information about the current input element
                if (currentElement) {
                        const elementInfo = {
                                tagName: currentElement.tagName.toLowerCase(),
                                type: currentElement.type || null,
                                id: currentElement.id || null,
                                name: currentElement.name || null,
                                className: currentElement.className || null,
                                placeholder: currentElement.placeholder || null
                        };

                        // For contenteditable, get some context
                        if (currentElement.contentEditable === 'true') {
                                elementInfo.contentEditable = true;
                                elementInfo.type = 'contenteditable';
                        }

                        // Try to get form context if element is in a form
                        const form = currentElement.closest('form');
                        if (form) {
                                elementInfo.formAction = form.action || null;
                                elementInfo.formMethod = form.method || null;
                                elementInfo.formId = form.id || null;
                        }

                        metadata.element = elementInfo;
                }

                return metadata;
        }

        // Post text to localhost:3000/utter via background script
        async function postText(text) {
                // Double-check the text is valid before posting
                const utteranceText = prepareTextForUtterance(text);
                if (!utteranceText) return;

                lastPostTime = Date.now();

                try {
                        const payload = {
                                text: utteranceText,
                                metadata: getMetadata()
                        };

                        // Send message to background script to handle the POST
                        const response = await browser.runtime.sendMessage({
                                type: 'POST_UTTERANCE',
                                payload: payload
                        });

                        if (response && response.success) {
                                console.log('Text posted successfully via background script:', payload);
                        } else {
                                console.warn('Failed to post text via background script:', response);
                        }
                } catch (error) {
                        console.warn('Error communicating with background script:', error);
                }
        }

        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', init);
        } else {
                init();
        }
})();
