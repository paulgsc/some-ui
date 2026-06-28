# AMO Reviewer Notes — YT Music Overlay (some-mujik)

## Host Permissions: `<all_urls>`

**Why it is needed:**

This extension overlays an ambient music card on whatever page the user is
currently browsing while YouTube Music plays in a background tab. It has
two distinct runtime roles that are resolved inside a single content-script
entry:

- **Source role** (YouTube tabs): The content script scrapes now-playing
  metadata from the YouTube / YouTube Music DOM and replies to background
  polling requests. This requires the content script to run on YouTube pages.

- **Display role** (all other tabs): The content script mounts a draggable
  waveform card that shows the current track. The overlay must appear on
  whatever page the user is actively viewing — this could be any HTTP/HTTPS
  URL (news sites, docs, GitHub, etc.).

Because the display role must work on any user-chosen tab, the extension
cannot pre-enumerate allowed origins. Restricting `matches` to a fixed list
would silently break the overlay for most users.

The background service-worker also uses `browser.tabs.query({})` and
`browser.tabs.sendMessage()` to push song data to the active display tab
and broadcast a clear signal when playback stops. These calls do not
exfiltrate tab URLs or content — they only route internal messages between
the extension's own content-script instances.

**Data collected:** none. No tab URLs, browsing history, or page content
is read, stored, or transmitted by the display role. The source role reads
only the title/artist/video-id visible in the YouTube player UI.
