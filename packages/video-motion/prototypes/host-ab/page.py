import json, sys, html, os
S = os.path.dirname(os.path.abspath(__file__))
vals = json.load(open(f"{S}/numbers.json")) if os.path.exists(f"{S}/numbers.json") else {}
t = open(f"{S}/page.tmpl.html").read()
t = t.replace("__RIG_SVG_JSON__", json.dumps(open(f"{S}/rig.svg").read()).replace("</", "<\\/"))
t = t.replace("__RIG_JS__", open(f"{S}/rig.js").read())
t = t.replace("__TS__", html.escape(open(f"{S}/host.ts.txt").read()))
for k, v in vals.items(): t = t.replace(f"__{k}__", v)
open(f"{S}/site/index.html", "w").write(t)
left = [x for x in ["A_NOTE","B_NOTE","A_ASSET","B_ASSET","B_BAKE","A_TIME","B_TIME","A_PROVE","SHEET_SHA","SHA"] if f"__{x}__" in t]
print("unfilled:", left)
