#!/usr/bin/env python3
"""Analyze MakeraBadge.nc: command vocabulary, tool changes, per-toolpath
geometry/feed/Z stats, and all non-path (non-G0/G1) lines.

Usage: python3 01-analyze-makera-nc.py path/to/MakeraBadge.nc
"""
import re
import sys
from collections import Counter, defaultdict

path = sys.argv[1] if len(sys.argv) > 1 else "testdata/MakeraBadge.nc"
lines = open(path, encoding="utf-8", errors="replace").read().splitlines()

word_re = re.compile(r"([A-Za-z])\s*([+-]?\d*\.?\d+)")

RAPID_MM_MIN = 3000.0  # assumed machine rapid rate for G0 (no F word applies)

toolpaths = []  # dicts: number, start_line, segments, zs, feeds, xy bounds
current = None
pos = {"X": 0.0, "Y": 0.0, "Z": 0.0}
feed = None
modal_g = None
total_cut_mm = 0.0
total_rapid_mm = 0.0
total_minutes = 0.0
non_path = []   # (lineno, text) for every line that is not a pure G0/G1 move
mkr = []
command_counter = Counter()
tool = None
blob_lines = 0

for i, raw in enumerate(lines, 1):
    line = raw.strip()
    if not line:
        continue
    if line.startswith(";"):
        if line.startswith(";@MKR|"):
            mkr.append((i, line))
            m = re.search(r"TOOLPATH_START\|toolpath_number=(\d+)", line)
            if m:
                current = {"number": int(m.group(1)), "start": i, "moves": 0,
                           "zs": set(), "feeds": set(), "minx": 1e9, "maxx": -1e9,
                           "miny": 1e9, "maxy": -1e9, "tool": None}
                toolpaths.append(current)
        elif re.fullmatch(r";[A-Za-z0-9+/=]{40,}", line):
            blob_lines += 1
        else:
            non_path.append((i, line))
        continue

    words = word_re.findall(line)
    codes = [f"{l.upper()}{int(float(v)) if l.upper() in 'GMT' else ''}" for l, v in words]
    gm = [f"{l.upper()}{int(float(v))}" for l, v in words if l.upper() in "GMT"]
    for c in gm:
        command_counter[c] += 1

    is_pure_move = all(l.upper() in "GXYZF" for l, _ in words) and \
        any(l.upper() == "G" and int(float(v)) in (0, 1) for l, v in words)
    modal_move = all(l.upper() in "XYZF" for l, _ in words)

    if not (is_pure_move or modal_move):
        non_path.append((i, line))

    # --- duration model: distance / feed for G1, RAPID_MM_MIN for G0 ---
    d_all = dict((l.upper(), float(v)) for l, v in words)
    g_codes = [int(float(v)) for l, v in words if l.upper() == "G"]
    if any(g in (0, 1) for g in g_codes):
        modal_g = 0 if 0 in g_codes else 1
    if "F" in d_all:
        feed = d_all["F"]
    if (is_pure_move or modal_move) and modal_g in (0, 1):
        nx = d_all.get("X", pos["X"])
        ny = d_all.get("Y", pos["Y"])
        nz = d_all.get("Z", pos["Z"])
        dist = ((nx - pos["X"]) ** 2 + (ny - pos["Y"]) ** 2 + (nz - pos["Z"]) ** 2) ** 0.5
        if modal_g == 0:
            total_rapid_mm += dist
            total_minutes += dist / RAPID_MM_MIN
            if current is not None:
                current["minutes"] = current.get("minutes", 0.0) + dist / RAPID_MM_MIN
        else:
            total_cut_mm += dist
            rate = feed or 1000.0
            total_minutes += dist / rate
            if current is not None:
                current["minutes"] = current.get("minutes", 0.0) + dist / rate
        pos = {"X": nx, "Y": ny, "Z": nz}

    if current is not None:
        d = d_all
        if "T" in d:
            current["tool"] = int(d["T"])
        if is_pure_move or modal_move:
            current["moves"] += 1
            if "Z" in d:
                current["zs"].add(d["Z"])
            if "F" in d:
                current["feeds"].add(d["F"])
            if "X" in d:
                current["minx"] = min(current["minx"], d["X"])
                current["maxx"] = max(current["maxx"], d["X"])
            if "Y" in d:
                current["miny"] = min(current["miny"], d["Y"])
                current["maxy"] = max(current["maxy"], d["Y"])

print(f"file: {path}, {len(lines)} lines, {blob_lines} trailing base64 comment lines")
print("\n== command counts (G/M/T words) ==")
for cmd, n in command_counter.most_common():
    print(f"  {cmd:6} {n}")

print("\n== MKR metadata ==")
for i, line in mkr:
    print(f"  line {i:6}: {line}")

print("\n== non-path lines (everything that is not a G0/G1/modal move or comment) ==")
for i, line in non_path:
    print(f"  line {i:6}: {line}")

print("\n== per-toolpath stats ==")
for tp in toolpaths:
    zs = sorted(tp["zs"])
    cutting = [z for z in zs if z < 0]
    print(f"  toolpath {tp['number']}: start line {tp['start']}, tool T{tp['tool']}, "
          f"{tp['moves']} moves")
    print(f"    XY bounds: X {tp['minx']:.2f}..{tp['maxx']:.2f}  Y {tp['miny']:.2f}..{tp['maxy']:.2f}")
    print(f"    Z levels: {zs}")
    print(f"    cutting Z passes: {cutting}")
    print(f"    feeds: {sorted(tp['feeds'])}")
    mins = tp.get("minutes", 0.0)
    print(f"    estimated duration: {int(mins)}m {int(mins % 1 * 60)}s")

print(f"\n== duration (rapids at {RAPID_MM_MIN:.0f} mm/min) ==")
print(f"  cut distance:   {total_cut_mm / 1000:.2f} m")
print(f"  rapid distance: {total_rapid_mm / 1000:.2f} m")
print(f"  estimated total: {int(total_minutes)}m {int(total_minutes % 1 * 60)}s"
      f"  (MKR header claims {1800 // 60}m)")
