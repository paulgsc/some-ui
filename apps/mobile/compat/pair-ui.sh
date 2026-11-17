#!/usr/bin/env bash
# Pairs the installed app with the stand-in home through its own screen, as
# a person does: sourced by storm.sh (COMPAT2) and by the snip capture
# (apps/mobile/snips/capture-apk.sh, SNIPS1), never run on its own.
#
#   source apps/mobile/compat/pair-ui.sh   # needs $here (this directory) and $out
#
# The foyer's gear, the front desk's Home tab (/settings/home, the bar's; it
# opens on Running), Pair..., the address and a sample code typed, Pair with
# <host>, until Unpair shows. Fields are found by their HTML id or
# placeholder (device-section.tsx), whichever the WebView exposes, through
# ui.mjs, over the accessibility tree: it works on the release APK, which
# keeps DevTools closed. Sample data only: the code is the stub's fixture.

# $here and $out are the sourcing script's.
# shellcheck disable=SC2154
# ui.mjs, its failures kept in $out/ui-errors.txt.
ui() { node "$here/ui.mjs" "$@" > /dev/null 2>> "$out/ui-errors.txt"; }

# Closes the soft keyboard, which can sit over the button below a field.
# Back only while it shows, so it never leaves the page.
hide_keyboard() {
  if adb shell dumpsys input_method | grep -q "mInputShown=true"; then
    adb shell input keyevent 4
    sleep 1
  fi
}

pair_by_ui() {
  ui tap '^Settings$' &&
    ui tap '^Home$' &&
    ui tap '^Pair\.\.\.$' &&
    ui type '^pair-address$|^https://file-host\.home\.example$' 'https://10.0.2.2:8787' &&
    ui type '^pair-code$|^K7QF 2M9X$' 'K7QF2M9X' &&
    hide_keyboard &&
    ui tap '^Pair with' &&
    ui find '^Unpair$'
}
