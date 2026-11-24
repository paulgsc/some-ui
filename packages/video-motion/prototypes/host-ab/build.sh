#!/bin/bash
# Assemble the prototype composition into the (git-excluded) compositions/host-v0.
set -e
H=$(dirname "$0")
D=/home/user/some-ui/packages/video-motion/compositions/host-v0
mkdir -p "$D"
python3 - "$H" "$D" <<'PY'
import sys,re
h,d=sys.argv[1],sys.argv[2]
svg=open(f"{h}/rig.svg").read()
inner=re.sub(r'^<svg[^>]*>','',svg.strip()); inner=re.sub(r'</svg>$','',inner)
t=open(f"{h}/index.tmpl.html").read().replace("__RIG__",inner)
open(f"{d}/index.html","w").write(t)
PY
cp "$H/rig.js" "$D/rig.js"
echo built "$D"
