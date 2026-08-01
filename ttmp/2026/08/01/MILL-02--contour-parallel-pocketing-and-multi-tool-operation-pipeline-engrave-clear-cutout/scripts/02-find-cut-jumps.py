#!/usr/bin/env python3
"""Find suspicious in-cut jumps in a generated .nc file: within each plunge
(sequence of G1 XY moves at negative Z), report segments much longer than
their neighbors — those show up as 'weird jumps' in a simulator.

Usage: python3 02-find-cut-jumps.py file.nc [threshold_mm]
"""
import re
import sys

path = sys.argv[1]
threshold = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0

word_re = re.compile(r"([A-Za-z])([+-]?\d*\.?\d+)")
x = y = z = 0.0
mode = None
cut_index = 0          # counts plunges
in_cut = False
start_line = 0
first_pt = None
prev = None
findings = []

for lineno, raw in enumerate(open(path), 1):
    line = raw.strip()
    if not line or line.startswith(";") or line.startswith("("):
        continue
    d = {l.upper(): float(v) for l, v in word_re.findall(line)}
    if "G" in d and int(d["G"]) in (0, 1):
        mode = int(d["G"])
    nx, ny, nz = d.get("X", x), d.get("Y", y), d.get("Z", z)

    if mode == 1 and nz < 0 and not in_cut:
        in_cut = True
        cut_index += 1
        start_line = lineno
        first_pt = (nx, ny)
        prev = (nx, ny)
    elif in_cut and (mode == 0 or nz >= 0):
        # retract: check closure of the ring
        if first_pt and prev:
            gap = ((prev[0] - first_pt[0]) ** 2 + (prev[1] - first_pt[1]) ** 2) ** 0.5
            if gap > 0.05:
                findings.append((start_line, cut_index, "OPEN RING", f"end-start gap {gap:.3f}mm"))
        in_cut = False
        first_pt = prev = None
    elif in_cut and mode == 1 and ("X" in d or "Y" in d):
        seg = ((nx - prev[0]) ** 2 + (ny - prev[1]) ** 2) ** 0.5
        if seg > threshold:
            findings.append((lineno, cut_index, "LONG CUT SEGMENT",
                             f"{seg:.2f}mm from ({prev[0]:.2f},{prev[1]:.2f}) to ({nx:.2f},{ny:.2f}) at Z{nz}"))
        prev = (nx, ny)

    x, y, z = nx, ny, nz

print(f"{path}: {cut_index} plunges, {len(findings)} findings (threshold {threshold}mm)")
for lineno, cut, kind, detail in findings[:40]:
    print(f"  line {lineno:6} (cut #{cut:3}): {kind}: {detail}")
