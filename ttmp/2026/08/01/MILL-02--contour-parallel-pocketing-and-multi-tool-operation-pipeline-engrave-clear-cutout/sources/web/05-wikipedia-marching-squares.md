---
Title: "Wikipedia: Marching Squares"
Ticket: MILL-02
Status: active
Topics:
    - research
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources:
    - https://en.wikipedia.org/wiki/Marching_squares
Summary: "Raw source capture for MILL-02 pocketing research."
LastUpdated: 2026-08-01T00:50:00-04:00
WhatFor: "Source evidence for the contour pocketing design guide."
WhenToUse: "When checking original source material."
---

In [computer graphics](https://en.wikipedia.org/wiki/Computer_graphics "Computer graphics"), **marching squares** is an [algorithm](https://en.wikipedia.org/wiki/Algorithm "Algorithm") that generates [contours](https://en.wikipedia.org/wiki/Contour_lines "Contour lines") for a two-dimensional [scalar field](https://en.wikipedia.org/wiki/Scalar_field "Scalar field") (rectangular [array](https://en.wikipedia.org/wiki/Array_data_structure "Array data structure") of individual numerical values). A similar method can be used to contour 2D [triangle meshes](https://en.wikipedia.org/wiki/Triangulated_irregular_network "Triangulated irregular network").

The contours can be of two kinds:

- *Isolines* – lines following a single data level, or *isovalue*.
- *Isobands* – filled areas between isolines.

Typical applications include the contour lines on [topographic maps](https://en.wikipedia.org/wiki/Topographic_map "Topographic map") or the generation of isobars for [weather maps](https://en.wikipedia.org/wiki/Weather_map "Weather map").

Marching squares takes a similar approach to the 3D [marching cubes](https://en.wikipedia.org/wiki/Marching_cubes "Marching cubes") algorithm:

- Process each cell in the grid independently.
- Calculate a cell index using comparisons of the contour level(s) with the data values at the cell corners.
- Use a pre-built [lookup table](https://en.wikipedia.org/wiki/Lookup_table "Lookup table"), keyed on the cell index, to describe the output geometry for the cell.
- Apply [linear interpolation](https://en.wikipedia.org/wiki/Linear_interpolation "Linear interpolation") along the boundaries of the cell to calculate the exact contour position.

## Basic algorithm

Here are the steps of the algorithm:

Apply a threshold to the 2D field to make a [binary](https://en.wikipedia.org/wiki/Binary_numeral_system "Binary numeral system") image containing:

- 1 where the data value is *above* the isovalue
- 0 where the data value is *below* the isovalue

Note: Data equal to the isovalue has to be treated as *above* or *below* in a consistent way.

Every 2x2 block of pixels in the binary image forms a contouring cell, so the whole image is represented by a grid of such cells (shown in green in the picture below). Note that this contouring grid is one cell smaller in each direction than the original 2D field.

For each cell in the contouring grid:

1. Compose the 4 [bits](https://en.wikipedia.org/wiki/Bit "Bit") at the corners of the cell to build a binary index: walk around the cell in a [clockwise](https://en.wikipedia.org/wiki/Clockwise "Clockwise") direction appending the [bit](https://en.wikipedia.org/wiki/Bit "Bit") to the index, using [bitwise OR](https://en.wikipedia.org/wiki/Bitwise_OR "Bitwise OR") and [left-shift](https://en.wikipedia.org/wiki/Logical_shift "Logical shift"), from [most significant bit](https://en.wikipedia.org/wiki/Most_significant_bit "Most significant bit") at the top left, to [least significant bit](https://en.wikipedia.org/wiki/Least_significant_bit "Least significant bit") at the bottom left. The resulting 4-bit index can have 16 possible values in the range 0–15.
2. Use the cell index to access a pre-built [lookup table](https://en.wikipedia.org/wiki/Lookup_table "Lookup table") with 16 entries listing the edges needed to represent the cell (shown in the lower right part of the picture below).
3. Apply [linear interpolation](https://en.wikipedia.org/wiki/Linear_interpolation "Linear interpolation") between the original field data values to find the exact position of the contour line along the edges of the cell.

![Marching Squares Algorithm illustration.](https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Marching_squares_algorithm_schematic.svg/960px-Marching_squares_algorithm_schematic.svg.png)

Marching Squares Algorithm illustration.

### Disambiguation of saddle points

The contour is ambiguous at [saddle points](https://en.wikipedia.org/wiki/Saddle_points "Saddle points"). It is possible to resolve the ambiguity by using the [average](https://en.wikipedia.org/wiki/Average "Average") data value for the center of the cell to choose between different connections of the interpolated points (four images in bottom-right corner):

![Marching squares](https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/Marching_squares_isolines.svg/960px-Marching_squares_isolines.svg.png)

Marching squares

### Isobands

A similar algorithm can be created for filled contour bands within upper and lower threshold values:

![Marching squares in the isoband case](https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Marching_squares_isobands.svg/960px-Marching_squares_isobands.svg.png)

Marching squares in the isoband case

## Contouring triangle meshes

The same basic algorithm can be applied to [triangular meshes](https://en.wikipedia.org/wiki/Triangulated_irregular_network "Triangulated irregular network"), which consist of connected triangles with data assigned to the vertices. For example, a scattered set of data points could be connected with a [Delaunay triangulation](https://en.wikipedia.org/wiki/Delaunay_triangulation "Delaunay triangulation") to allow the data field to be contoured.

A triangular cell is always *[planar](https://en.wikipedia.org/wiki/Plane_\(geometry\) "Plane (geometry)")*, because it is a *[2-simplex](https://en.wikipedia.org/wiki/Simplex "Simplex")* (i.e. specified by n +1 vertices in an n -dimensional space). There is always a unique linear interpolant across a triangle, and no possibility of an ambiguous saddle.

### Isolines

The analysis for [isolines](https://en.wikipedia.org/wiki/Isolines "Isolines") over triangles is especially simple: there are 3 binary digits, so there are 8 possibilities:

![Marching triangles cases, isoline case](https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/Marching_triangles_isolines.svg/960px-Marching_triangles_isolines.svg.png)

Marching triangles cases, isoline case

### Isobands

The analysis for [isobands](https://en.wikipedia.org/wiki/Level_set "Level set") over triangles requires 3 ternary trits, so there are 27 possibilities:

![Marching triangles cases, isoband case](https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Marching_triangles_isobands.svg/960px-Marching_triangles_isobands.svg.png)

Marching triangles cases, isoband case

## Dimensions and spaces

The *data space* for the Marching Squares algorithm is 2D, because the vertices assigned a data value are connected to their neighbors in a 2D [topological](https://en.wikipedia.org/wiki/Topology "Topology") grid, but the spatial coordinates assigned to the vertices can be in 2D, 3D or higher dimensions.

For example, a triangular mesh may represent a 2D data surface embedded in 3D space, where spatial positions of the vertices and interpolated points along a contour will all have 3 coordinates. Note that the case of squares is ambiguous again, because a [quadrilateral](https://en.wikipedia.org/wiki/Quadrilateral "Quadrilateral") embedded in 3-dimensional space is not necessarily planar, so there is a choice of geometrical interpolation scheme to draw the banded surfaces in 3D.

## Performance considerations

The algorithm is [embarrassingly parallel](https://en.wikipedia.org/wiki/Embarrassingly_parallel "Embarrassingly parallel"), because all cells are processed independently. It is easy to write a [parallel algorithm](https://en.wikipedia.org/wiki/Parallel_algorithm "Parallel algorithm") assuming:

- Shared read-only input scalar field.
- Shared append-only geometry output stream.

A naive implementation of Marching Squares that processes every cell independently will perform every [linear interpolation](https://en.wikipedia.org/wiki/Linear_interpolation "Linear interpolation") twice (isoline) or four times (isoband). Similarly, the output will contain 2 copies of the 2D vertices for disjoint lines (isoline) or 4 copies for polygons (isobands). \[Under the assumptions that: the grid is large, so that most cells are internal; and a full contiguous set of isobands is being created.\]

It is possible to reduce the computational overhead by [caching](https://en.wikipedia.org/wiki/Cache_\(computing\) "Cache (computing)") the results of interpolation. For example, a single-threaded serial version would only need to cache interpolated results for one row of the input grid.

It is also possible to reduce the size of the output by using indexed geometric primitives, *i.e.* create an [array](https://en.wikipedia.org/wiki/Array_data_structure "Array data structure") of 2D vertices and specify lines or polygons with [short integer](https://en.wikipedia.org/wiki/Short_integer "Short integer") offsets into the array.

## References

- Maple, C. (2003). "Geometric design and space planning using the marching squares and marching cube algorithms". *2003 International Conference on Geometric Modeling and Graphics, 2003. Proceedings*. pp. 90–95. [doi](https://en.wikipedia.org/wiki/Doi_\(identifier\) "Doi (identifier)"):[10.1109/GMAG.2003.1219671](https://doi.org/10.1109%2FGMAG.2003.1219671). [ISBN](https://en.wikipedia.org/wiki/ISBN_\(identifier\) "ISBN (identifier)") [978-0-7695-1985-2](https://en.wikipedia.org/wiki/Special:BookSources/978-0-7695-1985-2 "Special:BookSources/978-0-7695-1985-2"). [S2CID](https://en.wikipedia.org/wiki/S2CID_\(identifier\) "S2CID (identifier)") [11320513](https://api.semanticscholar.org/CorpusID:11320513).
- Banks, D. C. (2004). "Counting cases in substitope algorithms". *IEEE Transactions on Visualization and Computer Graphics*. **10** (4): 371–384. [CiteSeerX](https://en.wikipedia.org/wiki/CiteSeerX_\(identifier\) "CiteSeerX (identifier)") [10.1.1.582.7221](https://citeseerx.ist.psu.edu/viewdoc/summary?doi=10.1.1.582.7221). [doi](https://en.wikipedia.org/wiki/Doi_\(identifier\) "Doi (identifier)"):[10.1109/TVCG.2004.6](https://doi.org/10.1109%2FTVCG.2004.6). [PMID](https://en.wikipedia.org/wiki/PMID_\(identifier\) "PMID (identifier)") [18579966](https://pubmed.ncbi.nlm.nih.gov/18579966). [S2CID](https://en.wikipedia.org/wiki/S2CID_\(identifier\) "S2CID (identifier)") [2450480](https://api.semanticscholar.org/CorpusID:2450480).
- Laguardia, J. J.; Cueto, E.; Doblaré, M. (2005). ["A natural neighbour Galerkin method with quadtree structure"](https://doi.org/10.1002%2Fnme.1297). *International Journal for Numerical Methods in Engineering*. **63** (6): 789–812. [Bibcode](https://en.wikipedia.org/wiki/Bibcode_\(identifier\) "Bibcode (identifier)"):[2005IJNME..63..789L](https://ui.adsabs.harvard.edu/abs/2005IJNME..63..789L). [doi](https://en.wikipedia.org/wiki/Doi_\(identifier\) "Doi (identifier)"):[10.1002/nme.1297](https://doi.org/10.1002%2Fnme.1297). [S2CID](https://en.wikipedia.org/wiki/S2CID_\(identifier\) "S2CID (identifier)") [122746298](https://api.semanticscholar.org/CorpusID:122746298).
- Schaefer, Scott; Warren, Joe (2005). "Dual marching cubes: primal contouring of dual grids". *Computer Graphics Forum*. **24** (2): 195–201. [doi](https://en.wikipedia.org/wiki/Doi_\(identifier\) "Doi (identifier)"):[10.1111/j.1467-8659.2005.00843.x](https://doi.org/10.1111%2Fj.1467-8659.2005.00843.x). [S2CID](https://en.wikipedia.org/wiki/S2CID_\(identifier\) "S2CID (identifier)") [10015045](https://api.semanticscholar.org/CorpusID:10015045).
- Mantz, Huber; Jacobs, Karin; Mecke, Klaus (2008). "Utilizing Minkowski functionals for image analysis: a marching square algorithm". *Journal of Statistical Mechanics: Theory and Experiment*. **2008** (12) 12015. [Bibcode](https://en.wikipedia.org/wiki/Bibcode_\(identifier\) "Bibcode (identifier)"):[2008JSMTE..12..015M](https://ui.adsabs.harvard.edu/abs/2008JSMTE..12..015M). [doi](https://en.wikipedia.org/wiki/Doi_\(identifier\) "Doi (identifier)"):[10.1088/1742-5468/2008/12/P12015](https://doi.org/10.1088%2F1742-5468%2F2008%2F12%2FP12015). [S2CID](https://en.wikipedia.org/wiki/S2CID_\(identifier\) "S2CID (identifier)") [122873298](https://api.semanticscholar.org/CorpusID:122873298).
- Cipolletti, Marina P.; Delrieux, Claudio A.; Perillo, Gerardo M. E.; Piccolo, M. Cintia (2012). "Superresolution border segmentation and measurement in remote sensing images". *Computers & Geosciences*. **40**: 87–97. [Bibcode](https://en.wikipedia.org/wiki/Bibcode_\(identifier\) "Bibcode (identifier)"):[2012CG.....40...87C](https://ui.adsabs.harvard.edu/abs/2012CG.....40...87C). [doi](https://en.wikipedia.org/wiki/Doi_\(identifier\) "Doi (identifier)"):[10.1016/j.cageo.2011.07.015](https://doi.org/10.1016%2Fj.cageo.2011.07.015).

## External links

- [Marching Square Matlab algorithm](http://www.mathworks.com/matlabcentral/fileexchange/30525) – An easy to understand open-source marching square algorithm.
- [implementation](http://www.tomgibara.com/computer-vision/marching-squares) in Java
- [Marching Squares code](http://udel.edu/~mm/code/marchingSquares/) in Java. Given a 2D data set and thresholds, returns GeneralPath\[\] for easy plotting.
- [Meandering Triangles](https://blog.bruce-hill.com/meandering-triangles) explanation and sample Python implementation.
- [Marching Squares code in C](https://prideout.net/marching-squares) – A single header library for marching squares that can export triangle meshes for easy rendering.