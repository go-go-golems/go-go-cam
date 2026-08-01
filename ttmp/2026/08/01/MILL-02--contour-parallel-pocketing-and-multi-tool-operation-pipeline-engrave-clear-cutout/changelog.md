# Changelog

## 2026-08-01

- Initial workspace created


## 2026-08-01

Step 1: web research + defuddle sources + intern design guide with 4 decision records

### Related Files

- /home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/ttmp/2026/08/01/MILL-02--contour-parallel-pocketing-and-multi-tool-operation-pipeline-engrave-clear-cutout/design-doc/01-contour-pocketing-and-multi-tool-pipeline-research-and-implementation-guide.md — Primary deliverable


## 2026-08-01

Step 2: implemented pocketing.ts, operations.ts, fillHoles, rest machining, cutout, test patterns; 8 vitest tests green; browser-verified 3-toolpath program mirrors MakeraBadge.nc structure

### Related Files

- /home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/src/lib/operations.ts — Program emitter


## 2026-08-01

Step 3: full MakeraStudio prelude (SCHEMA/MACHINE/MATERIAL/STOCK/ORIGIN/TIME + full TOOL geometry, example-file defaults); TIME computed via parser round-trip; 9 tests green

### Related Files

- /home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/src/lib/operations.ts — Header emission with MKR_DEFAULTS


## 2026-08-01

Step 4: extracted shared pipeline library (runPipeline), pure-math test patterns, Node batch generator (pnpm gen:testgcode); generated 9 Makera Z1 test-pattern gcodes in gcode-tests/; confirmed no probe commands needed (firmware-side M6 probing)

### Related Files

- /home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/scripts/generate-test-gcode.ts — CLI batch generator
- /home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/src/lib/pipeline.ts — Shared DOM-free pipeline

