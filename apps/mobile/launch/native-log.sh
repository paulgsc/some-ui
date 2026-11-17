# What the launch test (launch-test.sh) and the storm scenario
# (apps/mobile/compat/storm.sh) share, sourced by both: the app's native log
# (tag "SomeUI") as logcat streams it to $out/logcat.txt, and the drag down
# a page that a pull is.
#
#   out=<dir> source apps/mobile/launch/native-log.sh
#
# Sets width and height from the screen, so source it once the emulator is up.

# A line the page's pull writes for each check that ends on the page that
# asked (lib/pull-refresh's `note` port).
PULL_CHECKED="pull checked: [a-z]+"

# Up to $2 seconds (default 10) for a line in the app's native log carrying
# $1, as the stream has it so far.
native_line() {
  for _ in $(seq 1 "${2:-10}"); do
    grep -qE "\bSomeUI\b.*$1" "$out/logcat.txt" && return 0
    sleep 1
  done
  return 1
}

# How many lines in the app's native log so far carry $1.
native_count() {
  grep -cE "\bSomeUI\b.*$1" "$out/logcat.txt" || true
}

# How the newest pull ended (read, offline, unread), from its last line.
last_pull_end() {
  grep -oE "\bSomeUI\b.*$PULL_CHECKED" "$out/logcat.txt" | tail -1 | grep -oE "[a-z]+$" || true
}

# A drag down the middle of the screen from 30% to 75% of its height: below
# the header, on the page, far past the pull's arming distance at any
# density. `wm size` prints an override line after the physical one when
# there is one, and the last is what is drawn.
size=$(adb shell wm size | tr -d '\r' | grep -oE "[0-9]+x[0-9]+" | tail -1 || true)
size=${size:-1080x1920}
width=${size%x*}
height=${size#*x}
pull_down() {
  adb shell input swipe $((width / 2)) $((height * 30 / 100)) \
    $((width / 2)) $((height * 75 / 100)) 600
}
