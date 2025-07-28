
// Background script to handle POST requests
// This avoids CSP issues that content scripts face

// Listen for messages from content script
browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
        if (message.type === 'POST_UTTERANCE') {
                try {
                        const response = await fetch('http://nixos.local:3000/utter', {
                                method: 'POST',
                                headers: {
                                        'Content-Type': 'application/json',
                                },
                                body: JSON.stringify(message.payload)
                        });

                        if (response.ok) {
                                console.log('Text posted successfully:', message.payload);
                                return { success: true, status: response.status };
                        } else {
                                console.warn('Failed to post text:', response.status, response.statusText);
                                return { success: false, status: response.status, error: response.statusText };
                        }
                } catch (error) {
                        console.warn('Error posting text:', error);
                        return { success: false, error: error.message };
                }
        }
});
