---
Title: "Wikipedia: Distance Transform"
Ticket: MILL-02
Status: active
Topics:
    - research
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources:
    - https://en.wikipedia.org/wiki/Distance_transform
Summary: "Raw source capture for MILL-02 pocketing research."
LastUpdated: 2026-08-01T00:50:00-04:00
WhatFor: "Source evidence for the contour pocketing design guide."
WhenToUse: "When checking original source material."
---

A **distance transform**, also known as **distance map** or **distance field**, is a derived representation of a [digital image](https://en.wikipedia.org/wiki/Digital_image "Digital image"). The choice of the term depends on the [point of view](https://en.wikipedia.org/wiki/Perspective_\(cognitive\) "Perspective (cognitive)") on the object in question: whether the initial image is transformed into another representation, or it is simply endowed with an additional map or field.

Distance fields can also be signed, in the case where it is important to distinguish whether the point is inside or outside of the shape.[^1]

The map labels each [pixel](https://en.wikipedia.org/wiki/Pixel "Pixel") of the image with the distance to the nearest *obstacle pixel*. A most common type of obstacle pixel is a *boundary pixel* in a [binary image](https://en.wikipedia.org/wiki/Binary_image "Binary image"). See the image for an example of a [Chebyshev distance](https://en.wikipedia.org/wiki/Chebyshev_distance "Chebyshev distance") transform on a [binary image](https://en.wikipedia.org/wiki/Binary_image "Binary image").

![](https://upload.wikimedia.org/wikipedia/commons/f/f7/Distance_Transformation.gif)

A distance transformation

Usually the transform/map is qualified with the chosen [metric](https://en.wikipedia.org/wiki/Metric_\(mathematics\) "Metric (mathematics)"). For example, one may speak of **Manhattan distance transform**, if the underlying metric is [Manhattan distance](https://en.wikipedia.org/wiki/Manhattan_distance "Manhattan distance"). Common metrics are:

- [Euclidean distance](https://en.wikipedia.org/wiki/Euclidean_distance "Euclidean distance")
- [Taxicab geometry](https://en.wikipedia.org/wiki/Taxicab_geometry "Taxicab geometry"), also known as *City block distance* or *Manhattan distance*.
- [Chebyshev distance](https://en.wikipedia.org/wiki/Chebyshev_distance "Chebyshev distance")

There are several algorithms to compute the distance transform for these different distance metrics, however the computation of the exact Euclidean distance transform (EEDT) needs special treatment if it is computed on the image grid.[^2]

Applications are [digital image processing](https://en.wikipedia.org/wiki/Digital_image_processing "Digital image processing") (e.g., blurring effects, [skeletonizing](https://en.wikipedia.org/wiki/Topological_skeletons "Topological skeletons")), [motion planning](https://en.wikipedia.org/wiki/Motion_planning "Motion planning") in [robotics](https://en.wikipedia.org/wiki/Robotics "Robotics"), medical-image analysis for prenatal [genetic testing](https://en.wikipedia.org/wiki/Genetic_testing "Genetic testing"), and even [pathfinding](https://en.wikipedia.org/wiki/Pathfinding "Pathfinding"). [^3] Uniformly-sampled signed distance fields have been used for [GPU](https://en.wikipedia.org/wiki/GPU "GPU") -accelerated [font](https://en.wikipedia.org/wiki/Font "Font") smoothing, for example by [Valve](https://en.wikipedia.org/wiki/Valve_Corporation "Valve Corporation") researchers.[^4]

Signed distance fields can also be used for (3D) [solid modelling](https://en.wikipedia.org/wiki/Solid_modelling "Solid modelling"). Rendering on typical GPU hardware requires conversion to polygon meshes, e.g. by the [marching cubes](https://en.wikipedia.org/wiki/Marching_cubes "Marching cubes") algorithm.[^5]

[^1]: Gibson, Sarah F. Frisken; Perry, Ronald N.; Rockwood, Alyn P.; Jones, Thouis R. (2000). ["Adaptively sampled distance fields: a general representation of shape for computer graphics"](https://www.merl.com/publications/docs/TR2000-15.pdf) (PDF). In Brown, Judith R.; Akeley, Kurt (eds.). *Proceedings of the 27th Annual Conference on Computer Graphics and Interactive Techniques, SIGGRAPH 2000, New Orleans, LA, USA, July 23-28, 2000*. Association for Computing Machinery. pp. 249–254. [doi](https://en.wikipedia.org/wiki/Doi_\(identifier\) "Doi (identifier)"):[10.1145/344779.344899](https://doi.org/10.1145%2F344779.344899).

[^2]: Strutz, Tilo: The Distance Transform and its Computation. June, 2021, TECH/2021/06, arXiv:2106.03503v1, [https://arxiv.org/abs/2106.03503](https://arxiv.org/abs/2106.03503)

[^3]: Felzenszwalb, Pedro F.; [Huttenlocher, Daniel P.](https://en.wikipedia.org/wiki/Daniel_P._Huttenlocher "Daniel P. Huttenlocher") (2012). ["Distance transforms of sampled functions"](https://doi.org/10.4086%2Ftoc.2012.v008a019). *Theory of Computing*. **8**: 415–428. [doi](https://en.wikipedia.org/wiki/Doi_\(identifier\) "Doi (identifier)"):[10.4086/toc.2012.v008a019](https://doi.org/10.4086%2Ftoc.2012.v008a019). [MR](https://en.wikipedia.org/wiki/MR_\(identifier\) "MR (identifier)") [2967180](https://mathscinet.ams.org/mathscinet-getitem?mr=2967180).

[^4]: *Chris Green. 2007. Improved alpha-tested magnification for vector textures and special effects. In ACM SIGGRAPH 2007 courses (SIGGRAPH '07). Association for Computing Machinery, New York, NY, USA, 9–18. [doi](https://en.wikipedia.org/wiki/Doi_\(identifier\) "Doi (identifier)"):[10.1145/1281500.1281665](https://doi.org/10.1145%2F1281500.1281665)*

[^5]: Archived at [Ghostarchive](https://ghostarchive.org/varchive/youtube/20211211/2MzSmdC49Ns) and the [Wayback Machine](https://web.archive.org/web/20140125070028/http://www.youtube.com/watch?v=2MzSmdC49Ns): [*Advanced visual effects with DirectX 11*](https://www.youtube.com/watch?v=2MzSmdC49Ns). *[YouTube](https://en.wikipedia.org/wiki/YouTube "YouTube")*.

[^6]: Kimmel, R.; Kiryati, N. and Bruckstein, A. M.: [Distance maps and weighted distance transforms](https://www.cs.technion.ac.il/~ron/PAPERS/KimKirBru_JMIV1996.pdf). Journal of Mathematical Imaging and Vision, Special Issue on Topology and Geometry in Computer Vision, 6:223-233,1996.