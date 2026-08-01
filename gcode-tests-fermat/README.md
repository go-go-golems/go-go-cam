# Engraver test-pattern batch

Generated 2026-08-01T06:38:07.713Z from abs-bicolor-v-engraver commit eca77d0
(`pnpm gen:testgcode`, scripts/generate-test-gcode.ts).

## Setup

- Machine: Makera Z1, stock: Bicolor ABS gold-on-black, 1.3mm (origin top-front-left, Z0 at stock top)
- Artwork width: 20mm, engraving depth: 0.12000000000000001mm (cap 0.1 + breakthrough 0.02)
- T2: 30deg V-bit (S12000, F1000/F500), T1: 3.175mm flat end (S10000, F800/F200)
- Strategy: fermat-parallel pocketing, flat-end clearing ON, cutout OFF
- Z scheme: clearance 3 / approach 2 / hop 2 (hop for travels <= 5mm), Makera-style feed-engage and toolchange prologue
- Each .nc has a matching .settings.json sidecar with the full generator settings and stats.

## Files

| pattern | label | operations | cut | est. time |
|---|---|---|---|---|
| pattern-filled-square-20mm.nc | Filled square | [T2]Engrave + [T1]Flat Clearing | 0.74m | 52s |
| pattern-square-outline-20mm.nc | Square outline | [T2]Engrave | 1.87m | 1m 55s |
| pattern-filled-circle-20mm.nc | Filled circle | [T2]Engrave + [T1]Flat Clearing | 0.7m | 48s |
| pattern-ring-20mm.nc | Ring (island test) | [T2]Engrave | 2.81m | 2m 50s |
| pattern-dumbbell-20mm.nc | Dumbbell (neck split test) | [T2]Engrave + [T1]Flat Clearing | 0.5m | 35s |
| pattern-stripes-20mm.nc | Thin stripes (detail test) | [T2]Engrave | 1.23m | 1m 22s |
| pattern-checkerboard-20mm.nc | Checkerboard | [T2]Engrave | 4.1m | 4m 36s |
| pattern-star-20mm.nc | Star (sharp corners) | [T2]Engrave + [T1]Flat Clearing | 0.92m | 1m 0s |
| pattern-text-20mm.nc | Text sample (bitmap CNC / 123) | [T2]Engrave | 2.38m | 3m 5s |
| cat-sample-30mm.nc | Cat sample | [T2]Engrave + [T1]Flat Clearing | 6.24m | 6m 58s |

Estimates are pure motion time (cut at programmed feed, rapids at 3000mm/min);
the machine adds acceleration and toolchange overhead.
