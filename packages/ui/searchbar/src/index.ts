// Searchbar was gutted: its old implementation was built on nuqs (URL query
// state) and next, both removed from this repo (see GHSA advisory / dependabot
// alert #55). Reintroduce this package as a keyboard-first search & navigation
// UI, without any next/nuqs coupling.
export {}
