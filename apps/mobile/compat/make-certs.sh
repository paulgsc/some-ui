#!/usr/bin/env bash
# A CA made for one run and trusted by nothing else, and the stand-in home's
# certificate from it, for IP 10.0.2.2 (the host as an emulator sees it).
# run-level.sh and the snip capture call it; trust-ca.sh puts ca.pem in the emulator's system
# store, and stub-home.mjs serves home.pem with home.key.
#
#   [CERT_FROM=<YYYYMMDDHHMMSSZ> CERT_TO=<YYYYMMDDHHMMSSZ>] \
#     bash apps/mobile/compat/make-certs.sh <dir>
#
# Writes ca.pem, ca.key, home.pem and home.key into <dir>, valid from now for
# a day; or, with CERT_FROM and CERT_TO, over that window, for an emulator
# whose clock is set to a fixed day (the snip capture's,
# apps/mobile/snips/capture-apk.sh). The runner's OpenSSL 3.0 backdates only
# through `openssl ca`.
set -euo pipefail

certs=$1
mkdir -p "$certs"

if { [ -n "${CERT_FROM:-}" ] && [ -z "${CERT_TO:-}" ]; } || { [ -z "${CERT_FROM:-}" ] && [ -n "${CERT_TO:-}" ]; }; then
  echo "make-certs.sh: set both CERT_FROM and CERT_TO, or neither" >&2
  exit 1
fi
if [ -n "${CERT_FROM:-}" ]; then
  mkdir -p "$certs/db"
  : > "$certs/db/index"
  echo 01 > "$certs/db/serial"
  cat > "$certs/ca.cnf" <<CNF
[ca]
default_ca = run
[run]
database = $certs/db/index
serial = $certs/db/serial
new_certs_dir = $certs/db
default_md = sha256
policy = any
copy_extensions = none
unique_subject = no
[any]
commonName = supplied
[root]
basicConstraints = critical,CA:TRUE
keyUsage = critical,keyCertSign
[home]
subjectAltName = IP:10.0.2.2
extendedKeyUsage = serverAuth
basicConstraints = CA:FALSE
CNF
  openssl req -new -newkey rsa:2048 -nodes -subj "/CN=android-compat CA" \
    -keyout "$certs/ca.key" -out "$certs/ca.csr" > /dev/null 2>&1
  openssl ca -batch -selfsign -config "$certs/ca.cnf" -keyfile "$certs/ca.key" \
    -in "$certs/ca.csr" -out "$certs/ca.pem" -extensions root \
    -startdate "$CERT_FROM" -enddate "$CERT_TO" -notext > /dev/null 2>&1
  openssl req -newkey rsa:2048 -nodes -subj "/CN=10.0.2.2" \
    -keyout "$certs/home.key" -out "$certs/home.csr" > /dev/null 2>&1
  openssl ca -batch -config "$certs/ca.cnf" -cert "$certs/ca.pem" -keyfile "$certs/ca.key" \
    -in "$certs/home.csr" -out "$certs/home.pem" -extensions home \
    -startdate "$CERT_FROM" -enddate "$CERT_TO" -notext > /dev/null 2>&1
  exit 0
fi
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=android-compat CA" \
  -keyout "$certs/ca.key" -out "$certs/ca.pem" \
  -addext basicConstraints=critical,CA:TRUE -addext keyUsage=critical,keyCertSign > /dev/null 2>&1
openssl req -newkey rsa:2048 -nodes -subj "/CN=10.0.2.2" \
  -keyout "$certs/home.key" -out "$certs/home.csr" > /dev/null 2>&1
printf 'subjectAltName=IP:10.0.2.2\nextendedKeyUsage=serverAuth\n' > "$certs/ext"
openssl x509 -req -in "$certs/home.csr" -CA "$certs/ca.pem" -CAkey "$certs/ca.key" \
  -CAcreateserial -days 1 -extfile "$certs/ext" -out "$certs/home.pem" > /dev/null 2>&1
