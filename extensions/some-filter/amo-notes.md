# AMO Notes to Reviewers — Ergonomic Page Filter

This extension operates as a visual page filter and must access every URL the
user visits to apply colour-temperature and contrast adjustments to all web
pages. The host permission `<all_urls>` is required because the filter is
user-configurable on a per-tab basis — narrowing to specific domains would
prevent it from working on the majority of pages the user browses.

No tab data, page content, or user activity is transmitted off-device; all
processing (luminance detection, CSS injection) runs entirely in the content
script within the page context. No network requests are made by the extension
itself.
