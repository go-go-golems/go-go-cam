---
Title: MakeraBadge.nc G-code Analysis
Ticket: MILL-01
Status: active
Topics:
    - frontend
    - cnc
    - gcode
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://testdata/MakeraBadge.nc
      Note: Subject of the analysis
    - Path: repo://ttmp/2026/08/01/MILL-01--split-mill-app-into-vite-ts-modules-and-add-g-code-visualizer/scripts/01-analyze-makera-nc.py
      Note: Analysis script producing all numbers in this doc
ExternalSources: []
Summary: 'Full structural analysis of the MakeraBadge.nc engraving job: MKR metadata schema, tool changes, toolpath structure, non-path commands, Z strategy, and duration model.'
LastUpdated: 2026-08-01T00:45:00-04:00
WhatFor: Reference for what the G-code visualizer and multi-tool generator must support.
WhenToUse: When extending the parser/generator to match real Makera Carvera output.
---


# MakeraBadge.nc G-code Analysis

Analyzed with `scripts/01-analyze-makera-nc.py` (checked into this ticket). File: 328KB, 18,531 lines, produced by MakeraStudio v0.0.0.1 for the Makera Z1. The job engraves a Makera badge into 1.3mm bicolor ABS (gold on black) and cuts the badge free at the end.

## File structure

```
lines 1-15      ;@MKR|... metadata header (machine, material, stock, origin, tools, toolpaths, time)
line 17         G90 G21           (absolute positioning, metric - the only setup commands)
line 18         TOOLPATH_START 1  -> T2 M6, S12000 M3, engraving pocket   (lines 18-17454)
line 17455      TOOLPATH_START 2  -> M5, T1 M6, S10000 M3, flat-end pocket (lines 17455-17651)
line 17652      TOOLPATH_START 3  -> contour cutout, three Z passes        (lines 17652-18262)
lines 18263-65  M05, G28, M02     (spindle off, home, program end)
lines 18266-531 ;(thumbnail_image_begin) ... 264 base64 comment lines ... ;(thumbnail_image_end)
```

## MKR metadata schema (`;@MKR|KEY|k=v|k=v`)

Structured comments a parser can read without heuristics:

- `MACHINE|id=Z1|name=Makera Z1`
- `MATERIAL|...|name3=Bicolor Stock - Gold on Black / 1.3mm(100mm*200mm)|name1=Plastic|name2=ABS`
- `STOCK|id=cuboid|length=100|width=100|height=1.3` - 100x100x1.3mm blank
- `ORIGIN|type_name=topFrontLeft|x=-50|y=-50|z=0.65` - origin at stock top, so cutting Z is negative
- `TOOL|number=N|name=...|type=...|diameter|tipdiameter|halfAngle...` - full tool geometry
- `TOOLPATH|number=N|tool_number=M|name=[T2]2D Pocket` - the toolpath -> tool mapping
- `TIME|seconds=1800` - MakeraStudio's own 30-minute estimate
- `TOOLPATH_START|toolpath_number=N` - inline markers delimiting each toolpath's block

## Command vocabulary (whole file)

| Command | Count | Role |
|---|---|---|
| G1 | 17,439 | linear cut move (only cutting motion used) |
| G0 | 792 | rapid |
| G90, G21 | 1 each | absolute, metric (single setup line) |
| T2/T1 + M6 | 2 | tool changes |
| S + M3 | 2 | spindle RPM + on (S12000 engraving, S10000 flat end) |
| M5/M05 | 2 | spindle off (before tool change, before end) |
| G28 | 1 | home at end |
| M2/M02 | 1 | program end |

Notably absent: G2/G3 arcs (all geometry is chorded into G1 moves), G17/G94, work offsets (G54...), drilling cycles, coolant M-codes.

## Non-path G-code (everything that isn't a motion line)

```
line    17: G90 G21
line    20: ; T2-3.175*0.3mm*30deg Engraving(Metal)    (human-readable tool comment)
line    22: T2 M6                                      (tool change: engraving bit)
line    24: S12000 M3                                  (12,000 RPM, spindle on)
line 17456: M5                                         (spindle off before change)
line 17458: ; T1-3.175*12mm Flat End(Metal)
line 17460: T1 M6                                      (tool change: flat end mill)
line 17462: S10000 M3
line 18263: M05                                        (zero-padded variant of M5!)
line 18264: G28                                        (return home)
line 18265: M02                                        (zero-padded variant of M2)
line 18266: ;(thumbnail_image_begin) ... base64 preview image ... ;(thumbnail_image_end)
```

Pattern per tool change: `M5` (if spindle running) -> comment -> `T# M6` -> `G0` to start XY -> `S#### M3` -> `G0` down to clearance -> `G1` plunge. Note Makera emits both `M5`/`M05` and `M2`/`M02` spellings - parsers must treat leading zeros as insignificant.

## Per-toolpath breakdown

### Toolpath 1 - `[T2]2D Pocket` (engraving), T2 0.3mm-tip 30deg engraving bit, S12000
- 17,431 moves; XY spans 10.15-89.85 x 10.23-89.77 (the 80x80mm artwork)
- Z levels: cut at **-0.1mm only** (single pass through the gold cap layer), clearance hops at 1.9/2.0, safe at 3.0
- Feeds: F500 (plunge) / F1000 (XY cut)
- This is the raster-style area clearing of the artwork: the bulk of the file, 13.04m of cutting, ~14m21s
- Structure of each engraving strip: `G0 X.. Y..` -> `G0 Z2` -> `G1 Z-0.1 F500` -> many `G1 X.. Y.. F1000` -> `G0 Z2/3`

### Toolpath 2 - `[T1]2D Pocket` (flat end), T1 3.175mm flat end, S10000
- Only 190 moves in a 1x1mm XY window near (50, 84.7) - this clears the **badge's hanger hole**
- Z levels: **-0.5, -1.0, -1.5** -> three stepdowns of 0.5mm through the 1.3mm stock (-1.5 cuts 0.2 past the bottom)
- Feeds: F300 (plunge/cut) / F1000; ~3s of motion

### Toolpath 3 - `[T1]2D Contour` (cutout), same T1, S10000
- 610 moves tracing the badge outline (rounded-square, XY 8.61-91.39) - the **cutout around the image** the user mentioned
- Same three-pass Z ladder: -0.5 / -1.0 / -1.5, F300 cut feed, 968mm of cutting, ~1m6s
- No holding tabs are emitted - the thin ABS is presumably held by tape/vacuum

## Duration model

Motion-time estimate (cut distance at programmed feed; rapids assumed 3000 mm/min since G0 carries no F word):

| Scope | Cut | Estimated |
|---|---|---|
| Toolpath 1 (engrave) | 13.04m | 14m 21s |
| Toolpath 2 (hole) | 14mm | 3s |
| Toolpath 3 (cutout) | 968mm | 1m 6s |
| **Total** (incl. 2.64m rapids) | **14.02m** | **15m 30s** |

MakeraStudio's own header claims 30 minutes - roughly 2x the pure-motion time, i.e. they budget for acceleration limits, tool-change pauses, and safety margin. The same model is implemented in `src/gcode/parser.ts` (`estimatedMinutes`) and shown in the visualizer summary and per-toolpath list.

## Implications for our app

1. **Parser** (done in MILL-01): linear-only motion, `;@MKR|` metadata, `T# M6`, `S`/`M3`/`M5`, `M2/M30` with leading-zero variants, `G28`; toolpath segmentation from `TOOLPATH_START` markers with M6 fallback.
2. **Generator** (future ticket): to reproduce this job style the generator needs a *multi-toolpath pipeline* - engraving pocket, flat-end clearing pocket with multi-pass Z stepdowns, and a final contour cutout with stepdowns - emitting tool changes and per-tool spindle speeds, not the current single-tool program.
3. **Z strategy**: cut-through operations use fixed stepdowns (0.5mm) to a bottom slightly past stock thickness; engraving uses a single shallow pass. Clearance is 2-3mm, retract between strips ~1.9-2mm.
