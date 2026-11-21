"""Charts for the open-question essay, drawn as SVG at 1920x1080 on a dark ground.
Numbers from claude/ci-audit-data:prototypes/ci-audit (cls.py and *-today.json), run 2026-11-21."""
import json, os, sys
OUT = os.path.dirname(os.path.abspath(__file__))
BG, INK, INK2, GRID = "#1a1a19", "#f0efec", "#c3c2b7", "#383835"
BLUE, ORANGE, AQUA = "#3987e5", "#d95926", "#199e70"
W, H = 1920, 1080

def page(title, sub, body, legend, source):
    leg = "".join(f'<span class="k"><i style="background:{c}"></i>{t}</span>' for t, c in legend)
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
body{{margin:0;width:{W}px;height:{H}px;background:{BG};color:{INK};font-family:Inter,system-ui,sans-serif}}
.wrap{{padding:90px 120px}} h1{{font-size:56px;margin:0 0 14px;font-weight:600}}
.sub{{font-size:30px;color:{INK2};margin-bottom:34px}} .leg{{font-size:26px;color:{INK2};margin-bottom:24px}}
.k{{margin-right:40px}} .k i{{display:inline-block;width:22px;height:22px;border-radius:4px;margin-right:12px;vertical-align:-3px}}
.src{{position:absolute;bottom:60px;left:120px;font-size:22px;color:{INK2};font-family:ui-monospace,monospace}}
svg text{{font-family:Inter,system-ui,sans-serif}}</style></head><body><div class="wrap">
<h1>{title}</h1><div class="sub">{sub}</div><div class="leg">{leg}</div>{body}</div>
<div class="src">{source}</div></body></html>"""

def bars(rows, colors, scale_max, step=300, label_w=520, bar_w=1100, row_h=88, unit="min"):
    """rows: [(label, [v1, v2, ...], note)] stacked horizontally with 2px surface gaps."""
    h = row_h * len(rows) + 40
    s = [f'<svg width="{label_w+bar_w+160}" height="{h}">']
    for t in range(0, int(scale_max) + 1, step):
        x = label_w + bar_w * t / scale_max
        s.append(f'<line x1="{x}" x2="{x}" y1="0" y2="{h-40}" stroke="{GRID}" stroke-width="1"/>')
        s.append(f'<text x="{x}" y="{h-8}" fill="{INK2}" font-size="20" text-anchor="middle">{t:,}</text>')
    for i, (label, vals, note) in enumerate(rows):
        y = i * row_h + 14
        s.append(f'<text x="{label_w-24}" y="{y+38}" fill="{INK}" font-size="28" text-anchor="end">{label}</text>')
        x = label_w
        for v, c in zip(vals, colors):
            w = bar_w * v / scale_max
            if w > 2:
                s.append(f'<rect x="{x}" y="{y+10}" width="{max(w-2,1)}" height="44" rx="4" fill="{c}"/>')
            x += w
        s.append(f'<text x="{x+18}" y="{y+40}" fill="{INK2}" font-size="24">{note}</text>')
    s.append("</svg>")
    return "".join(s)

SRC = "source: paulgsc/some-ui claude/ci-audit-data · prototypes/ci-audit · as of 2026-11-21"

# 1. Jobs that ran where the PR couldn't fail them (last 30 merged PRs).
jobs = [  # (label, total, couldn't fail) from cls.py
    ("Rust deny (5 jobs)", 625.4, 604.8),
    ("Rust CI", 154.9, 149.8),
    ("Node license audit", 135.0, 113.2),
    ("Node e2e", 860.8, 76.9),
    ("Render image", 182.8, 50.8),
    ("Node checks (3 jobs)", 1177.4, 4.9),
]
rows = [(l, [w, t - w], f"{w:,.0f} of {t:,.0f}") for l, t, w in jobs]
open(f"{OUT}/jobs-couldnt-fail.html", "w").write(page(
    "1,000 of 3,793 runner-minutes couldn't fail",
    "Last 30 merged some-ui PRs: minutes each job ran where the PR's files couldn't make it fail",
    bars(rows, [ORANGE, BLUE], 1200),
    [("couldn't fail", ORANGE), ("could fail", BLUE)], SRC))

# 2. Update-branch reruns, one day.
today = [("some-ui", 7052, 2647, "195 of 636 runs"), ("server", 4893, 798, "105 of 900 runs")]
rows = [(r, [m, t - m], f"{m:,} of {t:,}") for r, t, m, n in today]
open(f"{OUT}/update-branch-share.html", "w").write(page(
    "A merge of main, then every PR runs again",
    "PR runs on 2026-11-21, in minutes: some-ui 195 of 636 runs, server 105 of 900, were merges of main",
    bars(rows, [ORANGE, BLUE], 7200, step=1800, row_h=120),
    [("update-branch rerun", ORANGE), ("content push", BLUE)], SRC))

# 3. Two small PRs.
pp = json.load(open(f"{OUT}/../data/per_pr.json"))
def three(n):
    c = pp[str(n)]
    return [c.get("first-useful", 0), c.get("first-idle", 0), c.get("rerun-useful", 0) + c.get("rerun-idle", 0)]
rows = [("#3376 · 4 JSON files", three(3376), f"{sum(three(3376)):.0f} min"),
        ("#3377 · 1 test fixture", three(3377), f"{sum(three(3377)):.0f} min")]
open(f"{OUT}/two-small-prs.html", "w").write(page(
    "Two small PRs, in runner-minutes",
    "Every job of every run, CodeQL aside",
    bars(rows, [BLUE, ORANGE, AQUA], 90, step=30, row_h=130),
    [("could fail", BLUE), ("couldn't fail", ORANGE), ("update-branch rerun", AQUA)], SRC))
