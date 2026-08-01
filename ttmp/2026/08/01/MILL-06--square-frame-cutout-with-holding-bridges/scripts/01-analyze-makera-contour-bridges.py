#!/usr/bin/env python3
"""Reconstruct and report shallow bridge sections in a Makera contour toolpath.

The script is intentionally dependency-free. It finds a `TOOLPATH_START` marker,
tracks modal X/Y/Z/F words through G0/G1 motion, then pairs a rise from a deep
contour pass to a shallower Z with the next descent to the prior deep Z. Makera
uses those paired, sloped G1 moves to leave small holding bridges instead of
skipping XY geometry outright.

Usage:
  python3 scripts/01-analyze-makera-contour-bridges.py testdata/MakeraBadge.nc
  python3 scripts/01-analyze-makera-contour-bridges.py file.nc --toolpath 3
"""

from __future__ import annotations

import argparse
import math
import re
from dataclasses import dataclass
from pathlib import Path

WORD = re.compile(r"([A-Za-z])\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))")
MARKER = re.compile(r";@MKR\|TOOLPATH_START\|toolpath_number=(\d+)")


@dataclass(frozen=True)
class Move:
    line: int
    mode: int
    x0: float
    y0: float
    z0: float
    x1: float
    y1: float
    z1: float
    feed: float | None

    @property
    def xy_length(self) -> float:
        return math.hypot(self.x1 - self.x0, self.y1 - self.y0)


def parse_toolpath(path: Path, target: int) -> list[Move]:
    """Parse one marker-delimited toolpath while retaining modal coordinates."""
    active = False
    position = {"X": 0.0, "Y": 0.0, "Z": 0.0}
    feed: float | None = None
    mode: int | None = None
    moves: list[Move] = []

    for line_no, raw in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
        marker = MARKER.fullmatch(raw.strip())
        if marker:
            number = int(marker.group(1))
            if active and number != target:
                break
            active = number == target
            continue
        if raw.lstrip().startswith(";"):
            continue

        # Modal coordinates begin before the selected marker; continue parsing
        # the whole program so the first selected move inherits its true start.
        words = {letter.upper(): float(value) for letter, value in WORD.findall(raw)}
        if "G" in words and int(words["G"]) in (0, 1):
            mode = int(words["G"])
        if "F" in words:
            feed = words["F"]
        if mode not in (0, 1) or not any(axis in words for axis in ("X", "Y", "Z")):
            continue

        before = position.copy()
        for axis in ("X", "Y", "Z"):
            if axis in words:
                position[axis] = words[axis]
        if active:
            moves.append(Move(
                line_no, mode,
                before["X"], before["Y"], before["Z"],
                position["X"], position["Y"], position["Z"], feed,
            ))
    return moves


def bridge_pairs(moves: list[Move]) -> list[tuple[Move, Move]]:
    """Pair deep→shallow and shallow→same-deep G1 ramp moves.

    A pair is a bridge when each move changes both XY and Z, the first rises
    toward zero, the second descends, and the paired deep depths agree.
    """
    ramps = [
        move for move in moves
        if move.mode == 1 and move.xy_length > 1e-9 and abs(move.z1 - move.z0) > 1e-9
    ]
    pairs: list[tuple[Move, Move]] = []
    for up, down in zip(ramps, ramps[1:]):
        rises = up.z1 > up.z0
        descends = down.z1 < down.z0
        returns_to_same_depth = math.isclose(down.z1, up.z0, abs_tol=1e-6)
        stays_at_shallow_between = math.isclose(down.z0, up.z1, abs_tol=1e-6)
        if rises and descends and returns_to_same_depth and stays_at_shallow_between:
            pairs.append((up, down))
    return pairs


def side(x: float, y: float, bounds: tuple[float, float, float, float]) -> str:
    min_x, max_x, min_y, max_y = bounds
    distances = {
        "right": abs(x - max_x), "left": abs(x - min_x),
        "top": abs(y - max_y), "bottom": abs(y - min_y),
    }
    return min(distances, key=distances.get)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path, help="Makera-style G-code file")
    parser.add_argument("--toolpath", type=int, default=3, help="MKR toolpath number (default: 3)")
    args = parser.parse_args()

    moves = parse_toolpath(args.file, args.toolpath)
    if not moves:
        raise SystemExit(f"No motion found for toolpath {args.toolpath} in {args.file}")
    xy_moves = [m for m in moves if m.xy_length > 1e-9]
    bounds = (
        min(min(m.x0, m.x1) for m in xy_moves), max(max(m.x0, m.x1) for m in xy_moves),
        min(min(m.y0, m.y1) for m in xy_moves), max(max(m.y0, m.y1) for m in xy_moves),
    )
    z_levels = sorted({m.z1 for m in moves})
    pairs = bridge_pairs(moves)

    print(f"file: {args.file}")
    print(f"toolpath: {args.toolpath}; motion moves: {len(moves)}; XY bounds: "
          f"X {bounds[0]:.2f}..{bounds[1]:.2f}, Y {bounds[2]:.2f}..{bounds[3]:.2f}")
    print("observed endpoint Z levels: " + ", ".join(f"{z:g}" for z in z_levels))
    print(f"paired shallow bridge ramps: {len(pairs)}")
    print()
    print("deep pass  retained Z  bridge width  side    line pair  entry -> exit")
    print("---------  ----------  ------------  ------  ---------  --------------------------")
    for up, down in pairs:
        midpoint = ((up.x1 + down.x0) / 2, (up.y1 + down.y0) / 2)
        width = up.xy_length + down.xy_length
        print(
            f"{up.z0:>9g}  {up.z1:>10g}  {width:>10.2f}mm  "
            f"{side(*midpoint, bounds):<6}  {up.line:>5}/{down.line:<5}  "
            f"({up.x0:.2f},{up.y0:.2f}) -> ({down.x1:.2f},{down.y1:.2f})"
        )

    by_depth: dict[float, list[tuple[Move, Move]]] = {}
    for pair in pairs:
        by_depth.setdefault(pair[0].z0, []).append(pair)
    print("\nsummary by final/deep pass:")
    for depth, at_depth in sorted(by_depth.items()):
        widths = [a.xy_length + b.xy_length for a, b in at_depth]
        retained = at_depth[0][0].z1
        print(f"  Z{depth:g}: {len(at_depth)} bridges, retained at Z{retained:g}, "
              f"width {min(widths):.2f}..{max(widths):.2f}mm")


if __name__ == "__main__":
    main()
