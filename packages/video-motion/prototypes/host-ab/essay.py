# Writes the sample essay's cut list for medium A or B (same beats).
import json, sys
medium, out = sys.argv[1], sys.argv[2]
# the error box on the phone screen: image 824x1830 drawn at (380,90) h=900
k = 800 / 1830
err = {"x": round(420 + 412 * k), "y": round(70 + 1065 * k)}
title = {"x": round(420 + 400 * k), "y": round(70 + 150 * k)}
panel_rows = {"x": 1000, "y": 450}
def comp(id, ms, v, files=()):
    return {"id": id, "picture": {"kind": "composition", "ref": "host-v0",
            "variables": {"medium": medium, **{k: (json.dumps(x) if isinstance(x, (list, dict)) else x) for k, x in v.items()}},
            "files": list(files) + (["sheet.png"] if medium == "sprite" else [])}, "durationMs": ms, "voiceInMs": 0}
shots = [
  comp("hello", 5000, {
    "chapter": "Sample essay · the host",
    "places": [{"at": 0, "place": "closeup", "frame": "square"}],
    "beats": [
      {"at": 0, "pose": "idle", "expression": "neutral"},
      {"at": 0.9, "pose": "present", "expression": "pleased", "speaking": True, "say": "Hi. I'm the tin owlet, and I'll be your host."},
      {"at": 3.6, "pose": "idle", "expression": "pleased"},
    ]}),
  comp("apk", 8000, {
    "chapter": "The phone · Rust Rounds",
    "screen": "screen.png",
    "places": [{"at": 0, "place": "corner-br", "frame": "circle"}],
    "beats": [
      {"at": 0, "pose": "look", "expression": "neutral", "target": title, "speaking": True, "say": "This is a Rust Rounds card on the phone, on sample data."},
      {"at": 3.2, "pose": "point", "expression": "thinking", "target": err, "speaking": True, "say": "And here the compiler says why it won't build."},
      {"at": 6.0, "pose": "point", "expression": "surprised", "target": err},
    ]}, ["screen.png"]),
  comp("runners", 9000, {
    "chapter": "Waiting on CI",
    "panel": {"kicker": "Checks · sample", "title": "4 jobs queued", "rows": [["lint", "queued 14 min"], ["typecheck", "queued 14 min"], ["vitest (www)", "queued 14 min"], ["ui-fit", "queued 14 min"]], "note": "Waiting for a runner to pick up this job…"},
    "places": [{"at": 0, "place": "corner-bl", "frame": "square"}, {"at": 4.6, "place": "closeup", "frame": "square"}],
    "beats": [
      {"at": 0, "pose": "look", "expression": "upset", "target": panel_rows, "speaking": True, "say": "Fourteen minutes, and not one job has started."},
      {"at": 3.0, "pose": "point", "expression": "upset", "target": panel_rows, "speaking": True, "say": "Every one of them is still waiting for a runner."},
      {"at": 5.2, "pose": "facepalm", "expression": "desperate", "speaking": True, "say": "The runners are the bottleneck. Again."},
      {"at": 7.8, "pose": "facepalm", "expression": "desperate"},
    ]}),
  comp("bye", 4000, {
    "chapter": "",
    "places": [{"at": 0, "place": "closeup", "frame": "square"}],
    "beats": [
      {"at": 0, "pose": "think", "expression": "thinking"},
      {"at": 1.2, "pose": "present", "expression": "pleased", "speaking": True, "say": "Same inputs, same frames. See you next week."},
    ]}),
]
cut = {"schema": "some-ui.cut-list/2", "title": f"Host sample essay ({medium})", "series": {"id": "landscape", "version": 1},
       "look": "plain", "voice": "ad-lib", "shots": shots}
json.dump(cut, open(out, "w"), indent=1)
