#!/usr/bin/env python3
"""A resolver that fails each name once, then answers it (#3411).

The emulator's `-dns-server` points here. For each of NAMES (comma
separated), the first query of each
type is answered NOERROR with no address and the zone's SOA in the
authority section, its minimum 1800 s: the negative TTL home's real zone
gives (`maishatu.com`). Every later A query answers ADDRESS (TTL 300);
AAAA stays empty, as home's zone has no AAAA record. Any other name is
forwarded to UPSTREAM, so the emulator's own checks still work.

    python3 staged-dns.py NAMES ADDRESS [PORT] [UPSTREAM] [BIND]

BIND is the address listened on (default 0.0.0.0); on a host whose own
resolver holds 127.0.0.53:53 (systemd-resolved), give the host's address.

Each query is logged as one line: the type, and whether it was failed,
answered or forwarded. Standard library only.
"""
import socket
import struct
import sys

NAMES = {name.rstrip(".").lower() for name in sys.argv[1].split(",")}
ADDRESS = sys.argv[2]
PORT = int(sys.argv[3]) if len(sys.argv) > 3 else 53
UPSTREAM = sys.argv[4] if len(sys.argv) > 4 else "8.8.8.8"
BIND = sys.argv[5] if len(sys.argv) > 5 else "0.0.0.0"
NEGATIVE_TTL = 1800
A, AAAA = 1, 28
failed = set()


def question(packet):
    labels, at = [], 12
    while packet[at]:
        size = packet[at]
        labels.append(packet[at + 1 : at + 1 + size].decode().lower())
        at += 1 + size
    qtype, _ = struct.unpack("!HH", packet[at + 1 : at + 5])
    return ".".join(labels), qtype, at + 5


def encoded(name):
    return b"".join(bytes([len(p)]) + p.encode() for p in name.split(".")) + b"\0"


def reply(packet, end, answers, authority):
    head = struct.pack("!HHHHHH", struct.unpack("!H", packet[:2])[0], 0x8180, 1, len(answers), len(authority), 0)
    return head + packet[12:end] + b"".join(answers) + b"".join(authority)


def soa(name):
    zone = name.split(".", 1)[1]
    rdata = encoded("ns." + zone) + encoded("dns." + zone) + struct.pack("!IIIII", 1, 10000, 2400, 604800, NEGATIVE_TTL)
    return encoded(zone) + struct.pack("!HHIH", 6, 1, NEGATIVE_TTL, len(rdata)) + rdata


def address():
    rdata = socket.inet_aton(ADDRESS)
    return b"\xc0\x0c" + struct.pack("!HHIH", A, 1, 300, len(rdata)) + rdata


def main():
    server = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    server.bind((BIND, PORT))
    print(f"staged-dns: {sorted(NAMES)} each fail once, then answer {ADDRESS}", flush=True)
    while True:
        packet, peer = server.recvfrom(4096)
        try:
            name, qtype, end = question(packet)
        except (IndexError, struct.error, UnicodeDecodeError):
            continue
        if name not in NAMES:
            upstream = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            upstream.settimeout(3)
            try:
                upstream.sendto(packet, (UPSTREAM, 53))
                server.sendto(upstream.recvfrom(4096)[0], peer)
            except OSError:
                pass
            finally:
                upstream.close()
            continue
        if (name, qtype) not in failed:
            failed.add((name, qtype))
            print(f"staged-dns: {name} type {qtype} failed (no address, negative TTL {NEGATIVE_TTL})", flush=True)
            server.sendto(reply(packet, end, [], [soa(name)]), peer)
        elif qtype == A:
            print(f"staged-dns: {name} type 1 answered", flush=True)
            server.sendto(reply(packet, end, [address()], []), peer)
        else:
            print(f"staged-dns: {name} type {qtype} empty", flush=True)
            server.sendto(reply(packet, end, [], [soa(name)]), peer)


if __name__ == "__main__":
    main()
