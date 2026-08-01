---
Title: "clipper2-ts TypeScript port README"
Ticket: MILL-02
Status: active
Topics:
    - research
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources:
    - https://github.com/countertype/clipper2-ts
Summary: "Raw source capture for MILL-02 pocketing research."
LastUpdated: 2026-08-01T00:50:00-04:00
WhatFor: "Source evidence for the contour pocketing design guide."
WhenToUse: "When checking original source material."
---

## clipper2-ts

[![npm version](https://camo.githubusercontent.com/4c592663170f482be0474a48d1805ead72c1ebd9b131d4a3a14b1a768ec1dd2c/68747470733a2f2f696d672e736869656c64732e696f2f6e706d2f762f636c6970706572322d74732e737667)](https://www.npmjs.com/package/clipper2-ts) [![license](https://camo.githubusercontent.com/ef21178d7cd2f44da4f1325531d106d2b2ea8d96319bfb17e56afa5778d0770f/68747470733a2f2f696d672e736869656c64732e696f2f6e706d2f6c2f636c6970706572322d74732e737667)](https://github.com/countertype/clipper2-ts/blob/main/LICENSE)

TypeScript port of Angus Johnson's [Clipper2](https://github.com/AngusJohnson/Clipper2) library for polygon clipping, offsetting, and triangulation

## Installation

```
npm install clipper2-ts
```

## Usage

```
import { intersect, union, difference, xor, inflatePaths, FillRule, JoinType, EndType } from 'clipper2-ts';

// Define polygons as arrays of points
const subject = [[
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 }
]];

const clip = [[
  { x: 50, y: 50 },
  { x: 150, y: 50 },
  { x: 150, y: 150 },
  { x: 50, y: 150 }
]];

// Boolean operations
const intersection = intersect(subject, clip, FillRule.NonZero);
const unionResult = union(subject, clip, FillRule.NonZero);
const diff = difference(subject, clip, FillRule.NonZero);
const xorResult = xor(subject, clip, FillRule.NonZero);

// Polygon offsetting (inflate/deflate)
const offset = inflatePaths(subject, 10, JoinType.Round, EndType.Polygon);
```

### Triangulation

Convert polygons into triangles using constrained Delaunay triangulation:

```
import { triangulate, triangulateD, TriangulateResult } from 'clipper2-ts';

const polygon = [[
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 }
]];

const { result, solution } = triangulate(polygon);
if (result === TriangulateResult.success) {
  // solution contains triangles (each with 3 vertices)
  console.log(\`Created ${solution.length} triangles\`);
}

// For floating-point coordinates:
const { result: resultD, solution: solutionD } = triangulateD(polygon, 2);
```

### Z-coordinate support

Points can optionally carry a Z value (e.g., elevation, layer index, color). Z callbacks allow you to assign Z values to new vertices created at intersection points. See [Clipper2 Z Docs](https://www.angusj.com/clipper2/Docs/Overview.htm) for details

## Examples

Try the [interactive example](https://countertype.github.io/clipper2-ts/) showing all Clipper2 operations

To run locally:

```
npm install
npm run serve
# Then open http://localhost:3000/example/
```

## API

This port follows the structure and functionality of Clipper2's C# implementation, with method names adapted to JavaScript conventions. Where C# uses `PascalCase` for methods (`AddPath`, `Execute`), this port uses `camelCase` (`addPath`, `execute`). Class names remain unchanged

For detailed API documentation, see the [official Clipper2 docs](https://www.angusj.com/clipper2/Docs/Overview.htm)

## Testing

The port includes 258 tests validating against Clipper2's reference test suite:

```
npm test              # Run all tests
npm test:coverage     # Run with coverage report
```

The test suite validates clipping, offsetting, triangulation, and Z-callbacks against Clipper2's reference implementation. Polygon test 16 (bow-tie) uses relaxed tolerances as this edge case also fails in the C# reference

## Numeric precision

Unlike C# Clipper2, which has full int64 support, this library uses JavaScript's `Number` rather than `BigInt` for performance, with `BigInt` used for some intermediate arithmetic where needed. Coordinates must stay within the [safe integer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isSafeInteger) range (2^53); the library throws on overflow

If you have a use case that requires the full 64-bit range, and Clipper2-WASM isn't an option, please open an issue and we can discuss!

### Bundlers / minifiers (terser)

This library uses `BigInt` internally. Some versions/configurations of terser have had issues when compressing `BigInt` literals (eg `0n`). `clipper2-ts` avoids BigInt literal syntax in its source to improve compatibility

If you still hit terser issues in a consuming build, one workaround is `terserOptions: { compress: { evaluate: false } }`

## Performance

Faster than JavaScript-based Clipper (Clipper1) ports, slower than Clipper2-WASM; choose based on your constraints

## License

Boost Software License 1.0 (same as Clipper2)

## Credits

Original Clipper2 library by Angus Johnson. TypeScript port maintained by Jeremy Tribby

Benchmark polygon data from [Poly2Tri](https://github.com/jhasse/poly2tri) (BSD 3-clause). See `LICENSE_THIRD_PARTY` for details