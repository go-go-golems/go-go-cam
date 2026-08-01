# Source

- URL: https://en.wikipedia.org/wiki/Ramer%E2%80%93Douglas%E2%80%93Peucker_algorithm
- Retrieved: 2026-08-01

The **Ramer–Douglas–Peucker algorithm**, also known as the **Douglas–Peucker algorithm** and 
**iterative end-point fit algorithm**, is an algorithm that 
[decimates](https://en.wikipedia.org/wiki/Decimation_\(signal_processing\) "Decimation (signal 
processing)") a curve composed of line segments to a similar curve with fewer points. It was one of 
the earliest successful algorithms developed for [cartographic 
generalization](https://en.wikipedia.org/wiki/Cartographic_generalization "Cartographic 
generalization"). It produces the most accurate generalization, but it is also more 
time-consuming.[^1]

## Algorithm

![](https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Douglas-Peucker_animated.gif/250px-Dou
glas-Peucker_animated.gif)

Simplifying a piecewise linear curve with the Douglas–Peucker algorithm.

The starting curve is an ordered set of points or lines and the distance dimension *ε* > 0.

The algorithm [recursively](https://en.wikipedia.org/wiki/Recursion "Recursion") divides the line. 
Initially it is given all the points between the first and last point. It automatically marks the 
first and last point to be kept. It then finds the point that is farthest from the [line 
segment](https://en.wikipedia.org/wiki/Line_segment "Line segment") with the first and last points 
as end points; this point is always farthest on the curve from the approximating line segment 
between the end points. If the point is closer than ε to the line segment, then any points not 
currently marked to be kept can be discarded without the simplified curve being worse than ε.

If the point farthest from the line segment is greater than ε from the approximation then that 
point must be kept. The algorithm recursively calls itself with the first point and the farthest 
point and then with the farthest point and the last point, which includes the farthest point being 
marked as kept.

When the recursion is completed a new output curve can be generated consisting of all and only 
those points that have been marked as kept.

![](https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/RDP%2C_varying_epsilon.gif/250px-RDP%2
C_varying_epsilon.gif)

The effect of varying epsilon in a parametric implementation of RDP

### Non-parametric Ramer–Douglas–Peucker

The choice of ε is usually user-defined. Like most line fitting, polygonal approximation or 
dominant point detection methods, it can be made non-parametric by using the error bound due to 
digitization and quantization as a termination condition.[^2]

### Pseudocode

Assuming the input is a one-based array:

```
# source: https://karthaus.nl/rdp/
function DouglasPeucker(PointList[], epsilon)
    # Find the point with the maximum distance
    dmax = 0
    index = 0
    end = length(PointList)
    for i = 2 to (end - 1) {
        d = perpendicularDistance(PointList[i], Line(PointList[1], PointList[end])) 
        if (d > dmax) {
            index = i
            dmax = d
        }
    }

    ResultList[] = empty;

    # If max distance is greater than epsilon, recursively simplify
    if (dmax > epsilon) {
        # Recursive call
        recResults1[] = DouglasPeucker(PointList[1...index], epsilon)
        recResults2[] = DouglasPeucker(PointList[index...end], epsilon)

        # Build the result list
        ResultList[] = {recResults1[1...length(recResults1) - 1], 
recResults2[1...length(recResults2)]}
    } else {
        ResultList[] = {PointList[1], PointList[end]}
    }
    # Return the result
    return ResultList[]
```

## Application

The algorithm is used for the processing of [vector 
graphics](https://en.wikipedia.org/wiki/Vector_graphics "Vector graphics") and [cartographic 
generalization](https://en.wikipedia.org/wiki/Cartographic_generalization "Cartographic 
generalization"). It is recognized as the one that delivers the best perceptual representations of 
the original lines. But a self-intersection could occur if the accepted approximation is not 
sufficiently fine which led to the development of variant algorithms.[^3]

The algorithm is widely used in robotics [^4] to perform simplification and denoising of range data 
acquired by a rotating [range scanner](https://en.wikipedia.org/wiki/Laser_rangefinder "Laser 
rangefinder"); in this field it is known as the split-and-merge algorithm and is attributed to 
[Duda](https://en.wikipedia.org/wiki/Richard_O._Duda "Richard O. Duda") and 
[Hart](https://en.wikipedia.org/wiki/Peter_E._Hart "Peter E. Hart").[^5]

## Complexity

The running time of this algorithm when run on a polyline consisting of *n* – 1 segments and n 
vertices is given by the recurrence *T* (*n*) = *T* (*i* + 1) + *T* (*n* − *i*) + [*O* 
(*n*)](https://en.wikipedia.org/wiki/Big_O_notation "Big O notation") where *i* = 1, 2,..., *n* − 
2 is the value of `index` in the [pseudocode](https://en.wikipedia.org/wiki/Pseudocode 
"Pseudocode"). In the worst case, *i* = 1 or *i* = *n* − 2 at each recursive invocation yields a 
running time of *O* (*n* <sup>2</sup>). In the best case, *i* = ⁠ *n* 2⁠ or *i* = ⁠ *n* ± 
12⁠ at each recursive invocation yields a running time of Ω(*n* log *n*).

Using (fully or semi-) [dynamic convex hull](https://en.wikipedia.org/wiki/Dynamic_convex_hull 
"Dynamic convex hull") data structures, the simplification performed by the algorithm can be 
accomplished in *O* (*n* log *n*) time.[^6]

The running time for [digital elevation 
model](https://en.wikipedia.org/wiki/Digital_elevation_model "Digital elevation model") 
generalization using the three-dimensional variant of the algorithm is *O* (*n* <sup>3</sup>), but 
techniques have been developed to reduce the running time for larger data in practice.[^7]

## Similar algorithms

![](https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Douglas%E2%80%93Peucker_and_Visvalinga
m%E2%80%93Whyatt_simplification_algorithms.svg/250px-Douglas%E2%80%93Peucker_and_Visvalingam%E2%80%9
3Whyatt_simplification_algorithms.svg.png)

Comparison with Visvalingam–Whyatt algorithm

Alternative algorithms for line simplification include:

- [Visvalingam–Whyatt](https://en.wikipedia.org/wiki/Visvalingam%E2%80%93Whyatt_algorithm 
"Visvalingam–Whyatt algorithm")
- Reumann–Witkam
- Opheim simplification
- Lang simplification
- Zhao–Saalfeld
- Imai-Iri

[^1]: Shi, Wenzhong; Cheung, ChuiKwan (2006). "Performance Evaluation of Line Simplification 
Algorithms for Vector Generalization". *The Cartographic Journal*. **43** (1): 27–44. 
[Bibcode](https://en.wikipedia.org/wiki/Bibcode_\(identifier\) "Bibcode 
(identifier)"):[2006CartJ..43...27S](https://ui.adsabs.harvard.edu/abs/2006CartJ..43...27S). 
[doi](https://en.wikipedia.org/wiki/Doi_\(identifier\) "Doi 
(identifier)"):[10.1179/000870406x93490](https://doi.org/10.1179%2F000870406x93490).

[^2]: Prasad, Dilip K.; Leung, Maylor K.H.; Quek, Chai; Cho, Siu-Yeung (2012). ["A novel framework 
for making dominant point detection methods 
non-parametric"](http://eprints.nottingham.ac.uk/47521/). *Image and Vision Computing*. **30** 
(11): 843–859. [doi](https://en.wikipedia.org/wiki/Doi_\(identifier\) "Doi 
(identifier)"):[10.1016/j.imavis.2012.06.010](https://doi.org/10.1016%2Fj.imavis.2012.06.010).

[^3]: Wu, Shin-Ting; Marquez, Mercedes (2003). "A non-self-intersection Douglas-Peucker algorithm". 
*16th Brazilian Symposium on Computer Graphics and Image Processing (SIBGRAPI 2003)*. Sao Carlos, 
Brazil: IEEE. pp. 60–66. [CiteSeerX](https://en.wikipedia.org/wiki/CiteSeerX_\(identifier\) 
"CiteSeerX (identifier)") 
[10.1.1.73.5773](https://citeseerx.ist.psu.edu/viewdoc/summary?doi=10.1.1.73.5773). 
[doi](https://en.wikipedia.org/wiki/Doi_\(identifier\) "Doi 
(identifier)"):[10.1109/SIBGRA.2003.1240992](https://doi.org/10.1109%2FSIBGRA.2003.1240992). 
[ISBN](https://en.wikipedia.org/wiki/ISBN_\(identifier\) "ISBN (identifier)") 
[978-0-7695-2032-2](https://en.wikipedia.org/wiki/Special:BookSources/978-0-7695-2032-2 
"Special:BookSources/978-0-7695-2032-2"). 
[S2CID](https://en.wikipedia.org/wiki/S2CID_\(identifier\) "S2CID (identifier)") 
[10163908](https://api.semanticscholar.org/CorpusID:10163908).

[^4]: Nguyen, Viet; Gächter, Stefan; Martinelli, Agostino; Tomatis, Nicola; Siegwart, Roland 
(2007). ["A comparison of line extraction algorithms using 2D range data for indoor mobile 
robotics"](http://doc.rero.ch/record/320492/files/10514_2007_Article_9034.pdf) (PDF). *Autonomous 
Robots*. **23** (2): 97–111. [Bibcode](https://en.wikipedia.org/wiki/Bibcode_\(identifier\) 
"Bibcode 
(identifier)"):[2007AuRob..23...97N](https://ui.adsabs.harvard.edu/abs/2007AuRob..23...97N). 
[doi](https://en.wikipedia.org/wiki/Doi_\(identifier\) "Doi 
(identifier)"):[10.1007/s10514-007-9034-y](https://doi.org/10.1007%2Fs10514-007-9034-y). 
[hdl](https://en.wikipedia.org/wiki/Hdl_\(identifier\) "Hdl 
(identifier)"):[20.500.11850/9089](https://hdl.handle.net/20.500.11850%2F9089). 
[S2CID](https://en.wikipedia.org/wiki/S2CID_\(identifier\) "S2CID (identifier)") 
[35663952](https://api.semanticscholar.org/CorpusID:35663952).

[^5]: [Duda, Richard O.](https://en.wikipedia.org/wiki/Richard_O._Duda "Richard O. Duda"); [Hart, 
Peter E.](https://en.wikipedia.org/wiki/Peter_E._Hart "Peter E. Hart") (1973). [*Pattern 
classification and scene analysis*](https://archive.org/details/patternclassific0000duda). New 
York: Wiley. [ISBN](https://en.wikipedia.org/wiki/ISBN_\(identifier\) "ISBN (identifier)") 
[0-471-22361-1](https://en.wikipedia.org/wiki/Special:BookSources/0-471-22361-1 
"Special:BookSources/0-471-22361-1").

[^6]: Hershberger, John; Snoeyink, Jack (1992). [*Speeding Up the Douglas-Peucker 
Line-Simplification 
Algorithm*](http://www.bowdoin.edu/~ltoma/teaching/cs350/spring06/Lecture-Handouts/hershberger92spee
ding.pdf) (PDF) (Technical report).

[^7]: Fei, Lifan; He, Jin (2009). "A three-dimensional Douglas–Peucker algorithm and its 
application to automated generalization of DEMs". *International Journal of Geographical 
Information Science*. **23** (6): 703–718. 
[Bibcode](https://en.wikipedia.org/wiki/Bibcode_\(identifier\) "Bibcode 
(identifier)"):[2009IJGIS..23..703F](https://ui.adsabs.harvard.edu/abs/2009IJGIS..23..703F). 
[doi](https://en.wikipedia.org/wiki/Doi_\(identifier\) "Doi 
(identifier)"):[10.1080/13658810701703001](https://doi.org/10.1080%2F13658810701703001).
