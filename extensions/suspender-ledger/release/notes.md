<!-- amo-release
version: 0.3.1
content: sha256:870e02acd1a52748fc5b46a066ab45c60295e5c08002eb813348de9e8767c5df
rationale: Patch. Restores the toolbar popup on a browser profile where one of its reads fails (it opened as an empty strip) and records why; nothing new to use, and no permission, storage area or data handling changes.
-->

## Version notes

- Fixed: the toolbar popup could open as an empty dark strip when the browser couldn't answer one of its reads (this tab, your settings, your shortcuts, or which tabs it kept awake). It now always shows its controls, and says in one line what it couldn't read.
- Fixed: after such a failed read, adding or removing a whitelist rule no longer overwrites the rules you had saved.
- The Diagnostics page now also records when the popup couldn't read something, and when a tab was left alone because its address could not be read.

## Notes for reviewers

Suspender Ledger suspends background tabs with the browser's native tabs.discard(). There is no suspend page and it never closes a tab. Why it needs *://*/* and each permission, what both content scripts do, and how data is handled are in extensions/suspender-ledger/amo-notes.md in the source archive.

What changed since 0.3.0:

1. Popup (src/popup/index.ts, src/popup/hydrate.ts, src/popup/words.ts, src/popup/popup.css). The popup used to wait for four reads (tabs.query, storage.local.get, commands.getAll, storage.session.get) in one Promise.all and rendered nothing if any one failed. Each read and each section now stands alone; a failed read keeps its default and is named in a notice line. A whitelist add or remove now re-reads the stored list from storage.local before writing, and writes nothing if that read fails.

2. Diagnostics (src/types/messages.ts, src/worker/worker.ts, src/worker/core/observability.ts). When the popup could not read or show something, it sends one runtime.sendMessage to its own worker naming only which reads and sections failed (fixed names such as "settings"), and the worker records it as a "popup.trouble" event in the existing local event log (storage.local key sl.observability.v1). No URL, title or page content is in it.

3. Scheduler (src/worker/modes/number.ts). A tab whose URL fails to parse was already left unsuspended; it is now also recorded in the same event log as a skipped tab, by origin only, like every other skip.

4. No behaviour change: a word-wrap rule in debug.css, two helpers moved within extensions/common/src, and comments in src/content/watch.ts and title-marker.ts. These account for the rest of the changed bytes.

The permission, content script and file comparison below is computed from the 0.3.0 build and this one.
