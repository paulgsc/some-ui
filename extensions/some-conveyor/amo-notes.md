# AMO Notes to Reviewers — some-conveyor

This extension operates as a content conveyor that injects a rotating
polyhedron widget (backed by a WASM state machine) into web pages. The host
permission `<all_urls>` is required because the widget is designed to be
available on any page the user visits — narrowing to specific domains would
prevent it from functioning as a general-purpose overlay tool.

No page content, tab data, or user activity is transmitted off-device; all
processing is local. The WASM module runs entirely within the extension sandbox
and does not make outbound network requests.
