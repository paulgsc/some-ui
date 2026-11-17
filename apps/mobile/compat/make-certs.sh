#!/usr/bin/env bash
# A CA made for one run and trusted by nothing else, and the stand-in home's
# certificate from it, for IP 10.0.2.2 (the host as an emulator sees it).
# run-level.sh calls it; trust-ca.sh puts ca.pem in the emulator's system
# store, and stub-home.mjs serves home.pem with home.key.
#
#   bash apps/mobile/compat/make-certs.sh <dir>
#
# Writes ca.pem, ca.key, home.pem and home.key into <dir>.
set -euo pipefail

certs=$1
mkdir -p "$certs"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=android-compat CA" \
  -keyout "$certs/ca.key" -out "$certs/ca.pem" \
  -addext basicConstraints=critical,CA:TRUE -addext keyUsage=critical,keyCertSign > /dev/null 2>&1
openssl req -newkey rsa:2048 -nodes -subj "/CN=10.0.2.2" \
  -keyout "$certs/home.key" -out "$certs/home.csr" > /dev/null 2>&1
printf 'subjectAltName=IP:10.0.2.2\nextendedKeyUsage=serverAuth\n' > "$certs/ext"
openssl x509 -req -in "$certs/home.csr" -CA "$certs/ca.pem" -CAkey "$certs/ca.key" \
  -CAcreateserial -days 1 -extfile "$certs/ext" -out "$certs/home.pem" > /dev/null 2>&1
