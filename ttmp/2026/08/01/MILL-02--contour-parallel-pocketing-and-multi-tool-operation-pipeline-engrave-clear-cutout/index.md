---
Title: Contour-parallel pocketing and multi-tool operation pipeline (engrave/clear/cutout)
Ticket: MILL-02
Status: active
Topics:
    - frontend
    - cnc
    - gcode
    - toolpath-generation
    - research
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-08-01T00:46:51.549698902-04:00
WhatFor: ""
WhenToUse: ""
---

# MILL-02 — Contour-parallel pocketing and multi-tool pipeline

**Status: implemented.** Design guide + sources + implementation all landed 2026-08-01.

- Design/implementation guide: `design-doc/01-contour-pocketing-and-multi-tool-pipeline-research-and-implementation-guide.md` (uploaded to reMarkable `/ai/2026/08/01/MILL-02`)
- Diary: `reference/01-diary.md` (2 steps)
- Sources: `sources/web/` (Clipper2, marching squares, distance transform, LinuxCNC M-codes), `sources/pdf/` (toolpath strategy study)
- Implementation: `src/lib/pocketing.ts`, `src/lib/operations.ts`, `src/lib/patterns.ts`, operations planner in `src/main.ts`; tests in `src/lib/pocketing.test.ts` (`pnpm exec vitest run`)
- Verification screenshots: `various/viewer-multiop-square.png`, `various/viewer-ring-contour.png`
