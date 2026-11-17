# Installing and pairing the app on an emulator as a person would, sourced by
# storm.sh and any other workflow that drives the app (one copy, not two):
#
#   here=apps/mobile/compat out=<dir> source apps/mobile/compat/pair-ui.sh
#
# Needs $here (this directory) and $out (where ui.mjs's errors go), a booted
# emulator, and logcat streaming to $out/logcat.txt (native-log.sh reads it).

# shellcheck source=apps/mobile/launch/native-log.sh
source "$here/../launch/native-log.sh"
pkg=${pkg:-dev.paulgsc.someui}

# A clean install of $1, opened at the foyer, its database open.
# Waits for a new "device storage: opened" line: the log already holds the
# one from an earlier install.
install() {
  adb uninstall "$pkg" > /dev/null 2>&1 || true
  local opened
  opened=$(native_count "device storage: opened")
  adb install -r "$1" > /dev/null
  adb shell am start -W -n "$pkg/.MainActivity" > /dev/null
  for _ in $(seq 1 60); do
    [ "$(native_count "device storage: opened")" -gt "$opened" ] && return 0
    sleep 1
  done
  return 1
}
ui() { node "$here/ui.mjs" "$@" > /dev/null 2>> "$out/ui-errors.txt"; }
# Closes the soft keyboard, which can sit over the button below a field.
# Back only while it shows, so it never leaves the page.
hide_keyboard() {
  local ime
  ime=$(adb shell dumpsys input_method || true)
  if [[ "$ime" == *"mInputShown=true"* ]]; then
    adb shell input keyevent 4
    sleep 1
  fi
}

# pair_by_ui [address] [code] (default the stand-in home at
# https://10.0.2.2:8787 and a sample code). Pairs as a person does, on the
# release APK: in the first run's welcome when it is on screen (SIGNIN2),
# else the foyer's gear, the front desk's Home tab (/settings/home; it opens
# on Running) and Pair.... Both show the same form (device-pair-form.tsx):
# the address and code typed, then Pair with <host>. Fields are found by
# HTML id, label or placeholder; the earlier form's names are kept too.
pair_by_ui() {
  local address=${1:-https://10.0.2.2:8787} code=${2:-K7QF2M9X}
  local host=${address#*://}
  host=${host%%/*}
  if ! UI_WAIT_SECONDS=25 ui find 'Pair this phone with home'; then
    ui tap 'Settings' && ui tap 'Home' && ui tap 'Pair...' || return 1
  fi
  ui type "pair-address|Home's address|file-host.home.example|Home server address|https://file-host.home.example" "$address" &&
    ui type 'pair-code|Code from your computer|K7QF 2M9X' "$code" &&
    hide_keyboard &&
    ui tap "Pair with $host" &&
    ui find 'Sign out of home|Unpair|Home: signed in*'
}

# The first run's welcome (SIGNIN2), set aside for a run that does not pair.
dismiss_welcome() {
  UI_WAIT_SECONDS=25 ui tap 'Not now' || true
}
