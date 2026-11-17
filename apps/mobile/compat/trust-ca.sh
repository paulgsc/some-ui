#!/usr/bin/env bash
# Puts the run's throwaway CA into the emulator's *system* trust store, so
# the shipped APK, whose network config trusts only system CAs, accepts the
# stand-in home's https (COMPAT2). Never a user CA, never an app change: the
# stamp tests the APK as it ships.
#
#   bash apps/mobile/compat/trust-ca.sh <ca.pem>
#
# Needs a google_apis image (adb root works there; not on google_play). The
# store is replaced by a tmpfs holding its own certificates plus this one,
# mounted over /system/etc/security/cacerts. From API 34 Conscrypt reads the
# store from its APEX (/apex/com.android.conscrypt/cacerts) instead, and each
# zygote's mount namespace is its own, so the tmpfs is also bound there in
# every zygote's namespace (nsenter), before the app's process forks from
# one. Nothing survives a reboot.
#
# Exits non-zero when the CA is not in the store afterwards (as a zygote
# sees it, on API 34 and later). Whether the app trusts it shows only when
# it pairs: storm.sh fails a pairing that does not finish. On a failure
# here storm.sh reports the paired flow as not run on this level rather than
# working around it.
set -euo pipefail

ca=$1
hash=$(openssl x509 -subject_hash_old -in "$ca" -noout)
api=$(adb shell getprop ro.build.version.sdk | tr -d '\r')

adb root > /dev/null
adb wait-for-device
for _ in $(seq 1 30); do
  [ "$(adb shell id -u | tr -d '\r')" = 0 ] && break
  sleep 1
done

adb push "$ca" "/data/local/tmp/$hash.0" > /dev/null
store=/system/etc/security/cacerts
apex=/apex/com.android.conscrypt/cacerts
from=$store
if [ "$api" -ge 34 ]; then from=$apex; fi

adb shell "
set -e
mkdir -p /data/local/tmp/compat-cacerts
cp $from/* /data/local/tmp/compat-cacerts/
cp /data/local/tmp/$hash.0 /data/local/tmp/compat-cacerts/
mount -t tmpfs tmpfs $store
cp /data/local/tmp/compat-cacerts/* $store/
chown root:root $store/*
chmod 644 $store/*
chcon u:object_r:system_file:s0 $store/* 2>/dev/null || true
"

if [ "$api" -ge 34 ]; then
  adb shell "
set -e
for z in \$(pidof zygote) \$(pidof zygote64); do
  nsenter --mount=/proc/\$z/ns/mnt -- mount --bind $store $apex
done
"
fi

if [ "$api" -ge 34 ]; then
  adb shell "nsenter --mount=/proc/\$(pidof zygote64 zygote | cut -d' ' -f1)/ns/mnt -- ls $apex/$hash.0" > /dev/null
else
  adb shell "ls $store/$hash.0" > /dev/null
fi
echo "trust-ca: the run's CA ($hash.0) is in API $api's system store"
