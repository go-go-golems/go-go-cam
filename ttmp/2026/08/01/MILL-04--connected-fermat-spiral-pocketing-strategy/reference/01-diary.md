---
Title: Diary
Ticket: MILL-04
Status: active
Topics:
    - cnc
    - gcode
    - toolpath-generation
    - research
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Diary for the connected Fermat spiral pocketing implementation."
LastUpdated: 2026-08-01T02:11:34.6337786-04:00
WhatFor: ""
WhenToUse: ""
---

# Diary

## Goal

Chronological record of researching, designing, and implementing connected Fermat spiral pocketing (Zhao et al. 2016) as a third pocket strategy, including the visual build-up with screenshots.

## Step 1: Paper study and design

Downloaded the paper (22MB PDF into the ticket's sources/pdf) and read pages 1–5, which contain the complete algorithm; captured the project page and the ejbosia Python reimplementation with defuddle as secondary sources. The pivotal realization while reading Section 4: the paper's iso-contour set `c_{i,j}` with `d = (i−0.5)w` is *literally* the ring structure our `extractIsoContours` already produces, so the whole adaptation reduces to (a) organizing rings into a containment tree, (b) a per-chain in-and-back-out traversal, and (c) splicing child paths into parents. No gradient tracing is needed if alignment is done with nearest points on the dense pixel loops.

Designed a discrete "arc/gap/corridor" construction (design doc §3.2): anchors on successive loops form a radial corridor; each loop contributes its full circumference minus a 2-stepover gap at the corridor; the inward pass rides even loops and jumps two lanes at a time through the odd gaps; the outward pass rides odd loops through the even gaps; the center turn connects the two deepest opposite-parity loops. Start and exit land adjacent on the two outermost lanes — the Fermat property that makes regions splice-able and single-plunge.

### Prompt Context

**User prompt (verbatim):** "Ok, create a new ticket to implement fermat spirals. Here's the paper https://haisenzhao.github.io/CFS/files/fermat_spirals.pdf  but search for more resources if useful. Approach it systematically and build it up step by step ,if possible take screenshots and test patterns and such as you build it up, and keep a detailed diary as you work, and write up your work along with the images."

**Assistant interpretation:** Create MILL-04, study the CFS paper plus supplementary sources, design the adaptation to our ring infrastructure, implement incrementally with visual verification (screenshots of test patterns per stage), and produce a writeup document with the images plus this diary.

**Inferred user intent:** Get the retract-free clearing strategy identified as the "do it properly" upgrade in earlier discussion, implemented rigorously against the primary literature, with a visual record showing the algorithm working stage by stage.

### What I did
- Created MILL-04 with design doc, diary, writeup doc stubs and 9 tasks; `sources/pdf` + `sources/web` + `images/` dirs.
- Downloaded and read the paper (pages 1–5: abstract, spirallability, Fermat rerouting Fig. 5, spiral-contour tree + Type I/II nodes + bottom-up rerouting).
- Captured the CFS project page and ejbosia/connected-fermat-spirals with defuddle (frontmatter added).
- Wrote the design doc with the discrete construction and three decision records (containment tree over MST; no fairing pass; 2-stepover gaps).

### Why
- The arc/gap/corridor formulation avoids the paper's gradient-based inward/outward links entirely, replacing them with nearest-point alignment that is robust on pixel-derived loops and needs no new math.

### What worked
- The paper is self-contained in five pages for our purposes; the count of figures (4, 5, 6) maps one-to-one onto the three implementation stages planned (spiral, Fermat, connection).

### What didn't work
- A heredoc write of the design doc silently failed because the shell's working directory had persisted inside `sources/web` from a previous command — rewrote from the repo root. (Harness shells persist cwd across calls; relative ttmp paths are fragile.)

### What was tricky to build
- Nothing yet; the design-stage subtlety was convincing myself of the parity argument: every loop is traversed once minus its gap, every gap is crossed exactly once by the opposite-parity pass, so coverage is complete and the path is non-self-crossing so long as anchors stay aligned within a gap width.

### What warrants a second pair of eyes
- DR-3's claim that the gap sliver is covered by the crossing pass's tool width deserves scrutiny against a real cut; it holds arithmetically (lane spacing ≤ 45% of cut width) but corner cases at high curvature may differ.

### What should be done in the future
- Implementation Steps A–D per the task list, with screenshots at each stage.

### Code review instructions
- Read design doc §3 against the paper's §3–4 and Fig. 5; check the parity/coverage argument.
