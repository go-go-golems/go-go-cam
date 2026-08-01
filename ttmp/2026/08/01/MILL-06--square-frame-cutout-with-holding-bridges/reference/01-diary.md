---
Title: Diary
Ticket: MILL-06
Status: active
Topics:
    - cnc
    - gcode
    - frontend
    - toolpath-generation
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://src/lib/cutout.test.ts
      Note: Step 8 verification evidence (commit 801096a)
    - Path: repo://src/lib/cutout.ts
      Note: Step 8 pure planner implementation (commit 801096a)
    - Path: repo://testdata/MakeraBadge.nc
      Note: Primary evidence inspected chronologically
    - Path: repo://ttmp/2026/08/01/MILL-06--square-frame-cutout-with-holding-bridges/design-doc/01-square-frame-cutout-with-holding-bridges-analysis-design-and-implementation-guide.md
      Note: Detailed evidence-backed design recorded by the diary
    - Path: repo://ttmp/2026/08/01/MILL-06--square-frame-cutout-with-holding-bridges/scripts/01-analyze-makera-contour-bridges.py
      Note: Ticket-local script and recorded initial modal-coordinate fix
ExternalSources: []
Summary: Chronological evidence and decisions for the square-frame cutout and holding-bridge design.
LastUpdated: 2026-08-01T20:09:00-04:00
WhatFor: Preserve the research trail and implementation review guidance for MILL-06.
WhenToUse: Read before continuing ticket research or implementing the proposed cutout.
---



# Diary

## Goal

Record the evidence, decisions, commands, and delivery checks for a proposed end-of-job square-frame cutout that retains the workpiece with small bridges.

## Step 1: Create the ticket and establish the investigation boundary

I created MILL-06 as a documentation-first design ticket rather than changing production code. The requested change affects the final T1 cutout operation, but it has to be understood in the context of the complete image-to-G-code pipeline, its browser controls, and the Makera-compatible program writer.

The initial source read identified the current silhouette-cutout implementation and an existing real Makera job. This establishes a concrete baseline: the app already has a final cutout operation and a multi-pass depth ladder, while `MakeraBadge.nc` contains depth-varying segments that need a dedicated, reproducible analysis before borrowing the bridge strategy.

### Prompt Context

**User prompt (verbatim):** "Create anew docmgr ticket to add square frame cutout around the object at the end of the job, not just around the profile. Use the same \"keep little bridges\" approach than @testdata/MakeraBadge.nc  (I think, analyze).

Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.

Save all scripts you write in the scripts/ folder of the ticket, and keep a detailed diary at all times according to the diary skill.

[REMINDER] Output a <summary>...</summary> block at the VERY END of your response. This is mandatory."

**Assistant interpretation:** Create a new docmgr ticket, rigorously determine whether `MakeraBadge.nc` uses holding bridges, and produce an intern-oriented implementation design for replacing the current silhouette cutout with a square frame cutout; then validate and upload the documentation bundle to reMarkable.

**Inferred user intent:** Make generated engraving jobs release a consistently square workpiece while retaining it safely in the stock until manual removal, using behavior grounded in an actual Makera export rather than guesswork.

### What I did
- Ran `docmgr status --summary-only` and inspected the repository, existing MILL tickets, current branch, package commands, and vocabulary.
- Created `MILL-06` with `cnc,gcode,frontend,toolpath-generation` topics:
  `docmgr ticket create-ticket --ticket MILL-06 --title "Square frame cutout with holding bridges" --topics cnc,gcode,frontend,toolpath-generation`.
- Added the primary design document and this diary through `docmgr doc add`.
- Read the current public configuration (`src/lib/types.ts`), settings reader/UI (`src/main.ts`, `index.html`), planner (`src/lib/pipeline.ts`), G-code writer (`src/lib/operations.ts`), existing tests (`src/lib/pocketing.test.ts`), batch generator, and the earlier Makera file analysis.
- Inspected the actual final contour block at `testdata/MakeraBadge.nc:17652-18262` rather than accepting the prior ticket's conclusion.

### Why
- The proposed output shape and bridge behavior cross UI, settings, geometry/planning, operation ordering, and emitted G-code; documenting only one layer would leave an intern without the integration contract.
- The user explicitly marked the bridge claim as uncertain. The testdata is the primary local evidence and must override a stale interpretation.

### What worked
- `docmgr` created a clean ticket workspace at `ttmp/2026/08/01/MILL-06--square-frame-cutout-with-holding-bridges` with index, task list, changelog, design-doc, and diary.
- Existing code already centralizes final-operation construction in `runPipeline` and multi-pass emission in `generateProgram`, providing narrow implementation seams.
- Direct inspection found explicit XY+Z moves inside the second and final contour passes; these are strong evidence of Makera holding bridges, contrary to the earlier MILL-01 document's statement that no tabs were emitted.

### What didn't work
- The earlier analysis in `ttmp/2026/08/01/MILL-01--split-mill-app-into-vite-ts-modules-and-add-g-code-visualizer/analysis/01-makerabadge-nc-g-code-analysis.md:102-105` concluded: "No holding tabs are emitted." It did not analyze modal Z state or the inline XY+Z transitions, so that conclusion is incorrect.
- No production code was changed in this step; an implementation verification run is therefore not applicable yet.

### What I learned
- `MakeraBadge.nc` has a full first pass at Z-0.5, then preserves four local regions at Z-0.5 during later Z-1.0 and Z-1.5 passes. This is a tab/bridge strategy expressed as ramps in the continuous contour rather than omitted XY segments.
- The current app's cutout follows the artwork mask and fills holes before tracing, so it cannot currently produce a guaranteed square outline or bridge segments.

### What was tricky to build
- The key ambiguity is that the job does not label tabs. Its bridge behavior is encoded as modal, simultaneous XY+Z moves inside a repeated contour. A superficial scan of plunge depths sees `-0.5/-1/-1.5` and misses the local returns to `-0.5`; the investigation therefore needs a script that reconstructs modal position and pairs the shallow/deep transitions.

### What warrants a second pair of eyes
- The exact physical interpretation of the shallow sections must be checked against stock hold-down and a real air-cut/test coupon. G-code establishes the intended remaining thickness, but not whether four bridges with the observed geometry are sufficient for every material, stock size, and workholding method.

### What should be done in the future
- Implement only after the new square-frame and bridge API is approved, then validate generated G-code structurally and on a sacrificial workpiece.

### Code review instructions
- Start at `src/lib/pipeline.ts`, especially the optional cutout block and final `operations` list; then read `src/lib/operations.ts` to see how paths repeat across `passDepths`.
- Reproduce the evidence with the ticket-local analyzer once added, and run `pnpm test` plus `pnpm build` after implementation.

### Technical details
- Ticket location: `ttmp/2026/08/01/MILL-06--square-frame-cutout-with-holding-bridges`.
- Current cutout configuration fields are `cutoutEnable`, `cutoutMargin`, `stockThickness`, `cutoutStepdown`, and `cutoutOvercut` (`src/lib/types.ts:88-93`).
- Current operation order is `[T2]Engrave`, `[T1]Flat Clearing`, `[T1]Cutout` (`src/lib/pipeline.ts:266-271`), so the cutout is already last when it is non-empty.

## Step 2: Reconstruct the Makera bridge behavior

I wrote a ticket-local, dependency-free analyzer and used it to reconstruct the modal motion in the real final contour. The result confirms the user's hypothesis: `MakeraBadge.nc` deliberately leaves four holding bridges, expressed as two sloped G1 moves per bridge rather than a tab comment or an omitted segment.

The analysis also revealed an important detail for the implementation: the bridges are not constant-height plateaus. On each deeper pass the tool ramps from the nominal deep depth up to Z-0.5 and immediately back down, and the total ramp span grows with the amount cut below Z-0.5. The proposed planner should preserve that pass-proportional ramp form rather than merely skipping a fixed XY interval.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Verify the proposed reference behavior from the supplied Makera G-code before defining a compatible bridge policy.

**Inferred user intent:** Avoid releasing a thin workpiece during its final cutout while retaining a cut pattern that is proven in the local Makera sample.

### What I did
- Added `ttmp/2026/08/01/MILL-06--square-frame-cutout-with-holding-bridges/scripts/01-analyze-makera-contour-bridges.py`.
- Ran: `python3 ttmp/2026/08/01/MILL-06--square-frame-cutout-with-holding-bridges/scripts/01-analyze-makera-contour-bridges.py testdata/MakeraBadge.nc`.
- Ran `python3 -m py_compile` on the script.
- Corrected the script after its first output incorrectly included X=0/Y=0 in the selected toolpath bounds because it did not maintain modal position before the selected marker.
- Read geometry, rendering, and parser contracts to determine where variable-depth contour support belongs.

### Why
- A reproducible analysis script converts an ambiguous visual claim into inspectable numeric evidence and belongs in the ticket's `scripts/` directory as requested.
- Existing `Toolpath` points can carry `depth`, but `generateProgram` only recognizes pointwise depth for `kind === "detail"`; this is the central implementation limitation for bridge ramps on a contour.

### What worked
- The corrected analyzer found eight paired deep-to-shallow-to-deep ramp pairs:
  - Four bridges during the Z-1.0 pass, each 6.18–6.19mm long and retained at Z-0.5.
  - Four bridges during the Z-1.5 final pass, each 12.37–12.38mm long and retained at Z-0.5.
- The bridges lie once at the midpoint of each outer side (right, top, left, bottom), and their centers are at the contour's side midpoints.
- `python3 -m py_compile ttmp/2026/08/01/MILL-06--square-frame-cutout-with-holding-bridges/scripts/01-analyze-makera-contour-bridges.py` completed with no output and exit code 0.

### What didn't work
- First analyzer run reported `XY bounds: X 0.00..91.39, Y 0.00..91.31`. The defect was in the new script: it skipped all pre-marker motion and initialized the selected contour at the origin. I changed it to parse global modal coordinates while appending moves only inside the target toolpath.
- This was a documentation/research ticket step; production implementation tests have not been run because production code is intentionally unchanged.

### What I learned
- The prior MILL-01 statement that the file emits no tabs is disproven by `testdata/MakeraBadge.nc:17898-17899`, `17950-17951`, `18001-18002`, `18053-18054`, `18104-18105`, `18156-18157`, `18207-18208`, and `18259-18260`.
- With 1.3mm stock, a retained Z-0.5 cut depth leaves approximately 0.8mm of material. The reference's bridge span scales approximately linearly with extra depth below the retained cut: 6.19mm at 0.5mm extra depth and 12.37mm at 1.0mm extra depth.
- The renderer displays a `Toolpath` only as a 2D colored line (`src/lib/render.ts:47-76`), so it cannot communicate bridge depth without a follow-up visualization enhancement; the initial feature must instead be validated structurally through planned points and G-code.

### What was tricky to build
- The file mixes ordinary modal XY moves with inline XYZ ramp moves. Correct interpretation required carrying the prior modal Z and pairing each rise with the next descent that returns to the same deep level. The first implementation failed to carry pre-toolpath coordinates; the repair was to keep parsing global position state even while filtering stored moves by marker.

### What warrants a second pair of eyes
- The word "bridge width" can mean the total sloped span, a constant shallow plateau, or the final uncut ligament. Makera's file has no plateau; this ticket uses "bridge span" for the two-ramp total XY interval and "bridge thickness" for remaining material. Reviewers should confirm this vocabulary before it becomes UI/API terminology.

### What should be done in the future
- Keep the analyzer as a regression evidence tool and extend it if a later sample uses plateaus, different tab count, or a different retained depth.

### Code review instructions
- Review `scripts/01-analyze-makera-contour-bridges.py` first; its `bridge_pairs` predicate defines the evidence claim.
- Compare the printed line pairs with `testdata/MakeraBadge.nc` and then review the implementation guide's pass-proportional bridge pseudocode.

### Technical details
- Exact output: `Z-1: 4 bridges, retained at Z-0.5, width 6.18..6.19mm`; `Z-1.5: 4 bridges, retained at Z-0.5, width 12.37..12.38mm`.
- The selected final contour's true XY bounds are X 8.61–91.39 and Y 8.69–91.31 (`testdata/MakeraBadge.nc:17652-18262`).
- The reference contour begins with a complete Z-0.5 perimeter (`17656-17849`), then creates bridges only on subsequent deeper passes.

## Step 3: Produce the implementation design and test plan

I converted the source evidence into a detailed, implementation-ready guide for an intern. It maps every relevant module, defines the physical and code-level vocabulary, explains the existing profile-cutout limitation, and presents a narrow replacement architecture: pure square-frame planning plus pass-specific, pointwise-depth contour emission.

The design deliberately favors explicit physical settings over a magic Z coordinate. It proposes bridge thickness (material left) and final bridge span (the full two-ramp XY interval), then derives the shallow cut and intermediate spans from stock thickness and the ladder. That formulation is both faithful to Makera’s scaling and meaningful to an operator.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Write a clear, technical analysis/design/implementation guide with prose, diagrams, APIs, pseudocode, and file references that a new intern can use to implement the feature safely.

**Inferred user intent:** Turn a CNC feature idea into an evidence-backed, low-ambiguity engineering handoff rather than an underspecified code request.

### What I did
- Wrote the primary document at `design-doc/01-square-frame-cutout-with-holding-bridges-analysis-design-and-implementation-guide.md`.
- Included an architecture map, runtime flow diagram, current behavior analysis, Makera evidence, terminology, API sketches, square geometry formula, bridge-routing pseudocode, decision records, phased plan, test matrix, and physical safety validation plan.
- Defined implementation seams: new `src/lib/cutout.ts`, `Settings` additions, `Operation.pathsByPass`, generic pointwise-depth emission, pipeline replacement, UI changes, tests, and fixture generation updates.
- Updated `tasks.md` so the remaining work is limited to document relationships, hygiene, and reMarkable delivery.

### Why
- The current profile geometry and constant-depth operation loop are distinct limitations. A useful guide has to explain both and name the exact interface change that joins them.
- A pure geometry module enables unit tests without browser DOM, mirroring the repository’s existing reusable `runPipeline` architecture.

### What worked
- The guide derives the sample behavior without hard-coding its coordinates: for 1.3mm stock, 0.8mm remaining bridge thickness, and 1.5mm final depth, it yields retained cut depth 0.5mm and spans 0mm/6.2mm/12.4mm for the -0.5/-1/-1.5 ladder.
- The planned `pathsByPass` extension preserves the current shared-path behavior for existing operations while allowing the new final contour to vary geometry per depth.
- The document states no compatibility switch should be added for the old profile shape, consistent with the explicit feature request and the diary skill’s no-shim guardrail.

### What didn't work
- No production code has been changed, so no generated frame G-code or physical CNC result exists yet. The guide explicitly labels the design status as proposed and makes physical validation a required implementation phase.
- The existing renderer cannot show depth variation; this is a known limitation, not a reason to skip structural G-code tests.

### What I learned
- The only existing `DepthPoint.depth` emission path is gated by `path.kind === "detail"` (`src/lib/operations.ts:167-180`). Reusing that path kind for a T1 contour would corrupt presentation/statistics semantics; pass-specific routes plus data-driven pointwise depth are cleaner.
- Auto-crop currently reserves only profile-margin padding (`src/lib/pipeline.ts:84-101`). A square has corner extents that can exceed that padding, so geometry and crop behavior must be tested together.

### What was tricky to build
- The design needs to distinguish three depths at once: the pass’s nominal cut, the retained bridge cut, and the final full cut. I avoided mixing negative emitted Z with positive domain depth by specifying all planner depths as positive below-surface values and reserving sign conversion for the G-code writer. The resulting pseudocode makes the scaling calculation explicit and testable.

### What warrants a second pair of eyes
- Review the proposed semantics of `cutoutBridgeSpan`: it is the final pass’s total two-ramp interval, not a plateau width. Confirm the default 12.4mm is appropriate for intended small workpieces, and assess whether explicit usable-stock/clamp geometry must accompany the feature before enabling it by default.

### What should be done in the future
- Add explicit stock envelope and clamp-clearance modeling in a separate safety-focused change if frame cutouts will be used beyond known 100mm Makera-style blanks.

### Code review instructions
- Read the design document sections 3, 5, and 7 in order, then compare the proposed `Operation` API to `src/lib/operations.ts`.
- When implementation begins, start with `src/lib/cutout.ts` tests before touching the writer; validate with `pnpm test`, `pnpm build`, the ticket analyzer, simulation, air-cut, and sacrificial stock.

### Technical details
- Guide path: `ttmp/2026/08/01/MILL-06--square-frame-cutout-with-holding-bridges/design-doc/01-square-frame-cutout-with-holding-bridges-analysis-design-and-implementation-guide.md`.
- Key proposed formula: `span(D) = finalSpan * (D - retainedCutDepth) / (finalDepth - retainedCutDepth)` for `D > retainedCutDepth`; otherwise the pass has no bridge.
- Current source remains unmodified; `git status --short` contains only the new MILL-06 ticket directory.

## Step 4: Relate evidence and validate the research deliverable

I connected the focused design and diary to the source files that establish the proposal, then ran repository-level checks. The ticket is deliberately documentation-only: the successful application tests and build demonstrate that research artifacts did not perturb the product, while frontmatter and `docmgr doctor` demonstrate that the ticket is structurally ready for delivery.

The design document is now marked `review` because it is an actionable proposed implementation guide, not a claim that the CNC behavior has already been implemented. The diary remains `active` until the reMarkable handoff is recorded.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Store a robust design ticket with complete documentation bookkeeping, validate it, and prepare it for reMarkable delivery.

**Inferred user intent:** Leave a reviewable, durable record that is safe for an intern to pick up and easy for a reviewer to audit.

### What I did
- Related seven material files to the design doc and three to this diary with `docmgr doc relate`, using absolute paths.
- Updated the ticket changelog with the Makera bridge finding and implementation guide.
- Ran `docmgr task check --ticket MILL-06 --id 5,6`.
- Ran `docmgr validate frontmatter` for both ticket documents.
- Ran `docmgr doctor --ticket MILL-06 --stale-after 30`.
- Ran `pnpm test` and `pnpm build` from the repository root.

### Why
- The ticket must let a future reader navigate from a recommendation to primary evidence and affected source without re-discovering the repository.
- The build/test checks are scope guards: no production source was edited, and existing app quality remains intact before a future implementation begins.

### What worked
- `docmgr doc relate` recorded 7 design-doc relationships and 3 diary relationships.
- Both document frontmatters validated as `Ticket=MILL-06` with their intended document types.
- `docmgr doctor --ticket MILL-06 --stale-after 30` reported `All checks passed`.
- `pnpm test` passed: 2 files and 18 tests.
- `pnpm build` passed: `tsc --noEmit && vite build` completed successfully with Vite 6.4.3.

### What didn't work
- No failures occurred in this validation step.
- The successful test/build run does not validate the unimplemented square-frame feature; it only confirms unchanged current behavior. Feature-specific tests are prescribed in the guide for the future implementation.

### What I learned
- The current test suite has 18 tests across `src/lib/pocketing.test.ts` and `src/lib/fermat.test.ts`; writer coverage already lives in the former and is the appropriate neighborhood for regression assertions.
- `docmgr task check` recognizes the checklist IDs written in `tasks.md`, so delivery progress can remain machine-readable.

### What was tricky to build
- There is a difference between documentation validation and implementation validation. I recorded both separately: frontmatter/doctor validates the ticket, while the product test/build establishes the unchanged baseline. Neither substitutes for future structural G-code and physical CNC validation.

### What warrants a second pair of eyes
- Review the design doc’s source relationships and line references before implementation. In particular, confirm whether the existing fixed 100mm MKR header/default stock model is an acceptable safety boundary for automatically sized square frames.

### What should be done in the future
- Complete the delivery handoff, then treat the implementation checklist in the design document as the authoritative work plan; do not mark the feature itself complete before a simulator/air-cut/sacrificial-stock validation.

### Code review instructions
- Use the design document’s References section to open the linked source files, then run `pnpm test` and `pnpm build` to reproduce baseline health.
- Run `docmgr doctor --ticket MILL-06 --stale-after 30` to reproduce ticket hygiene.

### Technical details
- Changelog: `ttmp/2026/08/01/MILL-06--square-frame-cutout-with-holding-bridges/changelog.md`.
- Task list: `ttmp/2026/08/01/MILL-06--square-frame-cutout-with-holding-bridges/tasks.md`.
- Validation commands and results: `pnpm test` → 18 passed; `pnpm build` → passed; `docmgr doctor` → all checks passed.

## Step 5: Dry-run the reMarkable delivery bundle

I prepared the two-reader bundle—the implementation guide followed by the diary—and ran the mandatory no-mutation upload preview. It confirms that reMarkable delivery will render both Markdown documents into a single PDF with a depth-two table of contents and place it under the ticket-aware destination.

The dry run deliberately precedes the actual upload so malformed Markdown, title handling, or remote naming can fail before a cloud mutation. The command accepted both documents and produced no rendering/authentication error.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Upload the stored ticket documentation to reMarkable after preserving a safe and auditable delivery trail.

**Inferred user intent:** Make the design convenient to read away from the repository while avoiding accidental/opaque cloud changes.

### What I did
- Ran `remarquee upload bundle --dry-run` with the design guide and diary, `--toc-depth 2`, and `--non-interactive`.
- Set the bundle name to `MILL-06 Square Frame Cutout Guide` and destination to `/ai/2026/08/01/MILL-06`.

### Why
- The ticket workflow requires a dry run before upload, and a bundle keeps the guide and chronological evidence together for a reviewer.

### What worked
- Dry run output confirmed both files will be included, Pandoc will render one PDF, and the result will upload as `MILL-06 Square Frame Cutout Guide.pdf` to `/ai/2026/08/01/MILL-06`.
- No error output occurred.

### What didn't work
- No failures occurred. This dry run intentionally did not render or upload a PDF, so it is not cloud-delivery confirmation by itself.

### What I learned
- Remarquee derives display titles from the file basenames for bundle entries, while the outer PDF uses the supplied bundle name. The current filenames are clear enough for a review table of contents.

### What was tricky to build
- The dry-run output represents planned, not completed, delivery. I recorded that distinction explicitly and will only claim reMarkable delivery after the mutating bundle command reports success.

### What warrants a second pair of eyes
- The rendered PDF’s visual page breaks cannot be inspected from dry-run output. If the eventual PDF is hard to read on-device, adjust Markdown heading/table density in a follow-up documentation revision rather than changing the technical design silently.

### What should be done in the future
- Perform the actual upload once this updated diary re-passes `docmgr doctor`; then record the upload response and retain the local ticket as the canonical editable source.

### Code review instructions
- Repeat the dry run from the ticket root with the two Markdown paths and inspect that the destination is `/ai/2026/08/01/MILL-06`.
- For content review, open the design guide before the diary so its plan frames the chronological evidence.

### Technical details
- Exact dry-run confirmation: `DRY: pandoc <bundle> -> <tmp>/MILL-06 Square Frame Cutout Guide.pdf` and `DRY: upload MILL-06 Square Frame Cutout Guide.pdf -> /ai/2026/08/01/MILL-06`.
- No production code or generated product artifact changed in this delivery-preparation step.

## Step 6: Deliver the review bundle to reMarkable

After the updated diary passed ticket hygiene again, I performed the real bundle upload. Remarquee confirmed the PDF upload directly, so the two documents are now available as a single review bundle in the ticket-aware reMarkable directory.

The technical feature remains unimplemented by design. This delivery completes the requested research/design handoff, not the CNC feature’s physical acceptance; the guide’s implementation and test checklist remains the required next engineering work.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Complete the reMarkable upload of the ticket’s detailed guide and diary after safe validation.

**Inferred user intent:** Receive a readable, portable handoff while keeping the repository ticket as the canonical evidence source.

### What I did
- Re-ran `docmgr doctor --ticket MILL-06 --stale-after 30`; it reported all checks passed.
- Ran `remarquee upload bundle` for the design guide and diary with the prepared name, destination, ToC depth, and `--non-interactive`.

### Why
- The actual upload is the final requested delivery action after the dry-run verification and documentation-quality check.

### What worked
- Remarquee returned exactly: `OK: uploaded MILL-06 Square Frame Cutout Guide.pdf -> /ai/2026/08/01/MILL-06`.
- The latest pre-upload ticket validation remained clean.

### What didn't work
- No upload or validation failures occurred.
- No reMarkable cloud listing was run after success: the uploader’s explicit `OK: uploaded` result is the delivery confirmation, and avoiding an unnecessary listing minimizes remote operations.

### What I learned
- The bundle workflow successfully accepts the long-form guide and diary together with a depth-two ToC under the ticket-specific directory.

### What was tricky to build
- Completion has two different meanings here. The documentation delivery is complete, but the proposed software/CNC change is intentionally not marked implemented; preserving that distinction prevents a reader from treating the uploaded design as machine-validated code.

### What warrants a second pair of eyes
- A CNC reviewer should confirm physical bridge dimensions on the first sacrificial cut, especially if stock/material/feed differs from the 1.3mm ABS Makera example.

### What should be done in the future
- Implement the plan in a dedicated code change, run its structural and physical test matrix, and update this ticket or a successor with actual generated-G-code and machining evidence.

### Code review instructions
- Open `MILL-06 Square Frame Cutout Guide.pdf` from `/ai/2026/08/01/MILL-06`, then use the local ticket paths for editable source and line-level references.
- Verify the upload command result in this diary and reproduce local hygiene with `docmgr doctor --ticket MILL-06 --stale-after 30`.

### Technical details
- Delivered bundle: `MILL-06 Square Frame Cutout Guide.pdf`.
- Destination: `/ai/2026/08/01/MILL-06`.
- Delivery confirmation: `OK: uploaded MILL-06 Square Frame Cutout Guide.pdf -> /ai/2026/08/01/MILL-06`.

## Step 7: Begin the approved implementation and local-network delivery

The user approved the proposed design for implementation and added two process requirements: keep the diary current with each substantive step, make focused commits at appropriate boundaries, and serve the completed site to another computer on the local network. I reopened the ticket workflow with explicit implementation, emitter, integration, and verification tasks; the previously uploaded bundle remains a design snapshot and will be refreshed after implementation documentation is complete.

The implementation starts from a clean product baseline: only the uncommitted MILL-06 ticket exists in the worktree, and the pre-existing test/build baseline was green. I will first implement and test the pure square-frame planner, then generalize the emitter, then integrate the UI/pipeline, reducing risk by proving each lower-level contract before browser-facing wiring.

### Prompt Context

**User prompt (verbatim):** "same goal still, but make sure to Keep a detailed diary as you work, according to the diary skill format, and to commit at appropriate intervals. Serve the site so I can access it from another computer on the local network [REMINDER] Output a <summary>...</summary> block at the VERY END of your response. This is mandatory."

**Assistant interpretation:** Implement the documented square-frame holding-bridge feature, continuously document/commit the work, and expose the final site on a LAN-reachable address.

**Inferred user intent:** Receive a working, reviewable, and accessible implementation rather than only a design proposal, with enough history to audit or continue it.

### What I did
- Replaced the active durable goal with the implementation contract, preserving all existing design acceptance criteria and adding LAN serving, diary, and commit requirements.
- Read the full existing MILL-06 diary before resuming, as required for ticket continuation.
- Added four implementation tasks through `docmgr task add`: pure planner/tests, emitter/tests, UI/pipeline/batch wiring, and end-to-end verification/documentation/delivery.
- Confirmed the worktree has no existing product modifications; only the new ticket directory is untracked.

### Why
- The feature crosses independent data/geometry, G-code, and browser layers. Subdividing the ticket makes each commit and review boundary coherent.
- A LAN server must be started only after a production build and browser smoke test establish that the served artifact represents the implemented behavior.

### What worked
- `docmgr task add` created tasks `qbpn`, `2nl6`, `cagk`, and `3ond` for the active implementation sequence.
- The existing diary contains both the source evidence and explicit design APIs, so no new speculative design work is needed before code changes.

### What didn't work
- No implementation command has failed yet; implementation has not started at this diary point.
- Physical CNC air-cut and sacrificial-stock evidence remain unavailable in this coding environment and will be reported separately from software completion.

### What I learned
- The current `Operation` emitter shares one path array across passes and ties per-point depth to `PathKind.detail`; both constraints must be lifted without changing existing detail behavior.
- The Vite project already has `dev`, `build`, and `preview` scripts, so a production-preview process can be bound to `0.0.0.0` for LAN verification after build.

### What was tricky to build
- The task combines software acceptance and physical-process safety. I will implement and fully verify the software/G-code structural contract, but will not represent inaccessible physical milling as complete; the user needs a simulator/air-cut/sacrificial blank to close that separate evidence gap.

### What warrants a second pair of eyes
- Before physical use, verify that the default bridge thickness/span are suitable for the actual stock, hold-down, cutter, and feed—not merely the reference Makera ABS badge.

### What should be done in the future
- Perform simulator, air-cut, and sacrificial-material validation after code review; record results in this diary or the implementation follow-up.

### Code review instructions
- Review commits in this order: pure planner/test, emitter/test, integration/UI/test, then fixture/docs/serving verification.
- Re-run `pnpm test`, `pnpm build`, generated-G-code analysis, browser smoke checks, and the LAN HTTP request documented at the final step.

### Technical details
- Active goal: `c1792ea8-30e2-449a-b296-f0bd03d4fb7b`.
- New task IDs: `qbpn`, `2nl6`, `cagk`, `3ond`.
- Intended LAN serving command after build: `pnpm preview --host 0.0.0.0`.

## Step 8: Implement and test the pure square-frame planner

I implemented the geometry layer independently from the browser and G-code writer. `planSquareFrameCutout` now turns the cleaned foreground bounds into one machine-space square with tool-radius-adjusted margin, then plans one closed path per cut-depth pass. The first pass stays constant-depth; every deeper pass places a retained-depth midpoint on all four sides and proportionally expands its two-ramp bridge span toward the configured final span.

This commit establishes the physical contract without yet changing generated jobs. Isolating it first gives the emitter a tested, typed route plan and makes bridge safety errors explicit instead of silently shortening bridges or producing paths that run into corners.

### Prompt Context

**User prompt (verbatim):** (see Step 7)

**Assistant interpretation:** Implement the feature incrementally with durable diary and commit evidence, starting with the pure planner before integration.

**Inferred user intent:** Ensure the new square/bridge geometry is correct and reviewable independently of UI and machine output details.

**Commit (code):** 801096a79ab07ccadbd6e0dd45197f492242437d — "Feat: plan square cutout bridge passes"

### What I did
- Added `src/lib/cutout.ts` with `planSquareFrameCutout(model, passDepths)` and a `SquareFrameCutoutPlan` contract.
- Added `cutoutBridgeThickness` and `cutoutBridgeSpan` to `Settings` in `src/lib/types.ts`, and updated the cutout semantics comment to square frame.
- Added `src/lib/cutout.test.ts` with tests for non-square artwork, tool-radius clearance, bridge counts/spans, mirrored coordinate transforms, and invalid bridge configurations.
- Ran `pnpm test -- --run src/lib/cutout.test.ts`; Vitest ran all discovered tests and passed 3 files / 22 tests.
- Created focused code commit `801096a` after inspecting its staged file list.

### Why
- The geometry depends only on `Model`, `Settings`, foreground bounds, and canonical pixel/machine conversion. Keeping it pure prevents DOM/G-code concerns from hiding coordinate or bridge-span errors.
- A final bridge span must be rejected when it would reach a corner; silently reducing a physical retention feature would be an undocumented and dangerous behavior change.

### What worked
- A 30×10mm artwork at 2mm margin with a 2mm flat tool produces a 36mm square tool-center route: `30 + 2 * (2 + 1)`.
- 1.3mm stock, 0.8mm retained material, and `[-0.5, -1, -1.5]` produces complete/6.2mm/12.4mm bridge behavior exactly as planned.
- Each bridged pass has four retained-depth centers at deterministic positions, and mirrored transforms keep the output square around the transformed artwork.

### What didn't work
- No failure occurred in the focused test run.
- The command `pnpm test -- --run src/lib/cutout.test.ts` reports all tests because the package script already invokes `vitest run`; this is harmless but less narrow than the argument suggests.

### What I learned
- Pixel foreground bounds represent occupied cells, not point centers. The planner converts `maxX + 1` and `maxY + 1` so the requested finish margin clears the final pixel edge.
- Keeping a constant first pass as `Toolpath.depth` and only using per-point depth on bridged routes will let existing constant-contour emission remain simple while making later pass ramps explicit.

### What was tricky to build
- Image Y is inverted in `pixelToMachine`, and either machine axis can be mirrored. I converted all four artwork-bound corners and reduced them in machine space rather than assuming pixel min/max correspond to machine min/max. This removes a hidden orientation assumption and is covered by the mirror test.

### What warrants a second pair of eyes
- The current corner-clearance guard uses one flat-tool diameter. This is a conservative named safety constraint, but a machining reviewer should confirm whether a different corner clearance is preferred for the target cutter/material.

### What should be done in the future
- Integrate `pathsByPass` into the operation writer next, then prove the planner’s per-point depth is emitted as Makera-style XYZ ramps.

### Code review instructions
- Begin at `src/lib/cutout.ts`; read `machineBoundsForArtwork`, then the pass-span formula in `planSquareFrameCutout`.
- Run `pnpm test` and inspect `src/lib/cutout.test.ts` for the expected 0/6.2/12.4mm progression.

### Technical details
- The retained cut depth is `stockThickness - cutoutBridgeThickness`; it is positive below-surface depth, not emitted negative Z.
- The bridge formula is `finalSpan * (nominalDepth - retainedCutDepth) / (finalDepth - retainedCutDepth)` only for passes deeper than the retained cut depth.
