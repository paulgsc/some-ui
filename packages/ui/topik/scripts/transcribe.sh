#!/usr/bin/env bash
# usage: bash packages/ui/topik/scripts/transcribe.sh <driveFileId>
# Downloads one voice note as the read-only service account drive-reader
# (DRIVE_SA_KEY_B64), checks its byte count against Drive, and prints
# `[language probability, duration, bytes] text`. Fails with NO-AUDIO when the
# note can't be fetched. The first call installs faster-whisper, google-auth and
# the small speech model (about 1 GB, under a minute) outside the checkout;
# later calls take seconds. Never prints the key.
set -euo pipefail
D="${TMPDIR:-/tmp}/stt"; mkdir -p "$D"
[ -x "$D/venv/bin/python" ] || python3 -m venv "$D/venv"
"$D/venv/bin/python" -c "import faster_whisper, google.auth, requests" 2>/dev/null || "$D/venv/bin/pip" install -q faster-whisper google-auth requests
HF_HOME="$D/hf" "$D/venv/bin/python" -I - "$1" "$D" <<'PY'
import sys, os, json, base64, subprocess, numpy as np
fid, d = sys.argv[1], sys.argv[2]
key = os.environ.get("DRIVE_SA_KEY") or base64.b64decode(os.environ.get("DRIVE_SA_KEY_B64", "")).decode()
if not key.strip(): sys.exit("NO-AUDIO: DRIVE_SA_KEY_B64 is not set in this environment")
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession
drive = AuthorizedSession(service_account.Credentials.from_service_account_info(
    json.loads(key), scopes=["https://www.googleapis.com/auth/drive.readonly"]))
url = f"https://www.googleapis.com/drive/v3/files/{fid}"
meta = drive.get(url, params={"fields": "name,size"})
if meta.status_code != 200: sys.exit(f"NO-AUDIO: drive-reader can't see {fid} (HTTP {meta.status_code}); is its folder shared with it?")
body = drive.get(url, params={"alt": "media"}); body.raise_for_status()
if len(body.content) != int(meta.json()["size"]): sys.exit(f"NO-AUDIO: got {len(body.content)} bytes, Drive says {meta.json()['size']}")
src, pcm = f"{d}/{fid}.audio", f"{d}/{fid}.f32"
open(src, "wb").write(body.content)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-ar", "16000", "-ac", "1", "-f", "f32le", pcm], check=True)
from faster_whisper import WhisperModel
segs, info = WhisperModel("small", device="cpu", compute_type="int8").transcribe(np.fromfile(pcm, dtype=np.float32), beam_size=5)
print(f"[{info.language} {info.language_probability:.2f}, {info.duration:.1f}s, {len(body.content)} bytes]", "".join(s.text for s in segs).strip())
PY
