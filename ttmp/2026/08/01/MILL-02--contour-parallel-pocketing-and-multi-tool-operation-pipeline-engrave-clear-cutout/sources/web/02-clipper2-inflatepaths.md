---
Title: "Clipper2 InflatePaths API"
Ticket: MILL-02
Status: active
Topics:
    - research
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources:
    - https://angusj.com/clipper2/Docs/Units/Clipper/Functions/InflatePaths.htm
Summary: "Raw source capture for MILL-02 pocketing research."
LastUpdated: 2026-08-01T00:50:00-04:00
WhatFor: "Source evidence for the contour pocketing design guide."
WhenToUse: "When checking original source material."
---

Delphi **function** InflatePaths(**const** paths: TPaths64; delta: Double;  
jt: TJoinType; et: TEndType; MiterLimit: double): TPaths64;

Delphi **function** InflatePaths(**const** paths: TPathsD; delta: Double;  
jt: TJoinType; et: TEndType; miterLimit: double; precision: integer): TPathsD;

C++Paths64 InflatePaths(**const** Paths64& paths, **double** delta,  
[**JoinType**](https://angusj.com/clipper2/Docs/Units/Clipper/Types/JoinType.htm) join\_type, [**EndType**](https://angusj.com/clipper2/Docs/Units/Clipper/Types/EndType.htm) end\_type,  
**double** miter\_limit = 2.0, **double** arc\_tolerance = 0.0);

C++PathsD InflatePaths(**const** PathsD& paths, **double** delta,  
JoinType join\_type, EndType end\_type, **double** miter\_limit = 2.0,  
int precision = 2, **double** arc\_tolerance = 0.0);

C# **public static** Paths64 InflatePaths(Paths64 paths, **double** delta,  
JoinType joinType, EndType endType,  
**double** miterLimit, **double** arcTolerance = 0.0);

C# **public static** PathsD InflatePaths(PathsD paths, **double** delta,  
JoinType joinType, EndType endType,  
**double** miterLimit, int precision = 2, **double** arcTolerance = 0.0);

These functions encapsulate most of the features of [**ClipperOffset**](https://angusj.com/clipper2/Docs/Units/Clipper.Offset/Classes/ClipperOffset/_Body.htm), the class that performs both polygon and open path offsetting. (And it's important to understand the [**notes**](https://angusj.com/clipper2/Docs/Units/Clipper.Offset/Classes/ClipperOffset/_Body.htm#notes) pertaining to offsetting too.)  

| Parameter | Explanation |
| --- | --- |
| paths | A [**Paths64**](https://angusj.com/clipper2/Docs/Units/Clipper/Types/Paths64.htm) or [**PathsD**](https://angusj.com/clipper2/Docs/Units/Clipper/Types/PathsD.htm) object that is to undergo offsetting. |
| delta | The amount paths are to be offset. |
| joinType | See [**JoinType**](https://angusj.com/clipper2/Docs/Units/Clipper/Types/JoinType.htm). |
| endType | See [**EndType**](https://angusj.com/clipper2/Docs/Units/Clipper/Types/EndType.htm). |
| miterLimit | See [**ClipperOffset.MiterLimit**](https://angusj.com/clipper2/Docs/Units/Clipper.Offset/Classes/ClipperOffset/Properties/MiterLimit.htm). |
| precision | The number of decimal places of precision to consider when paths is type PathsD. (Maximum is 8 decimal places) |
| arcTolerance | See [**ClipperOffset.ArcTolerance**](https://angusj.com/clipper2/Docs/Units/Clipper.Offset/Classes/ClipperOffset/Properties/ArcTolerance.htm). |

```
#include "clipper2/clipper.h"  
...
using namespace Clipper2Lib;

int main()
{
  PathsD polyline, solution;
  polyline.push_back(MakePathD({100,100, 1500,100, 100,1500, 1500,1500}));
  // offset polyline
  solution = InflatePaths(polyline, 200, JoinType::Miter, EndType::Square);

  //draw polyline and inflated solution
}
```

![](https://angusj.com/clipper2/Images/offset2.svg)

```
#include "clipper2/clipper.h"  
...
using namespace Clipper2Lib;

int main()
{
  PathsD polygon, solution; 
  // add outer polygon contour
  polygon.push_back(Ellipse(RectD(100, 100, 1500, 1500)));
  // add inner "hole" contour
  PathD p = Ellipse(RectD(400, 400, 1200, 1200));
  std::reverse(p.begin(), p.end());
  polygon.push_back(p);

  // offset polygon
  solution = InflatePaths(polygon, 100, JoinType::Round, EndType::Polygon);
  
  //draw polygon and inflated solution
}
```

![](https://angusj.com/clipper2/Images/offset1.svg)

## See Also

[ClipperOffset](https://angusj.com/clipper2/Docs/Units/Clipper.Offset/Classes/ClipperOffset/_Body.htm), [ClipperOffset.ArcTolerance](https://angusj.com/clipper2/Docs/Units/Clipper.Offset/Classes/ClipperOffset/Properties/ArcTolerance.htm), [ClipperOffset.MiterLimit](https://angusj.com/clipper2/Docs/Units/Clipper.Offset/Classes/ClipperOffset/Properties/MiterLimit.htm), [EndType](https://angusj.com/clipper2/Docs/Units/Clipper/Types/EndType.htm), [JoinType](https://angusj.com/clipper2/Docs/Units/Clipper/Types/JoinType.htm), [Paths64](https://angusj.com/clipper2/Docs/Units/Clipper/Types/Paths64.htm), [PathsD](https://angusj.com/clipper2/Docs/Units/Clipper/Types/PathsD.htm)

Copyright © 2010-2024 Angus Johnson - Clipper2 2.0.0 - Help file built on 17 Dec 2025