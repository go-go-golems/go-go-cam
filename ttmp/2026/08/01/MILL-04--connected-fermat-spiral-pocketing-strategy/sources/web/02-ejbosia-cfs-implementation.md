---
Title: "ejbosia connected-fermat-spirals (Python reimplementation)"
Ticket: MILL-04
Status: active
Topics:
    - research
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources:
    - https://github.com/ejbosia/connected-fermat-spirals
Summary: "Source capture for MILL-04 Fermat spiral research."
LastUpdated: 2026-08-01T02:15:00-04:00
WhatFor: "Evidence for the CFS design."
WhenToUse: "When checking original source material."
---

## Connected Fermat Spirals

> ⚠️
> 
> This is an updated and simplified version of my original [Fermat Spirals repo](https://github.com/ejbosia/Fermat-Spirals).

Connected Fermat Spirals are a space filling curve that could be used for additive manufacturing. The algorithm is presented in this paper: [https://dl.acm.org/doi/10.1145/2897824.2925958](https://dl.acm.org/doi/10.1145/2897824.2925958).

## Development

This project uses [uv](https://github.com/astral-sh/uv) for dependency management, including the python version.

Run main.py

```
uv run main.py
```

Run tests

```
uv run pytest
```

`main.py` currently contains a quick example for plotting a connected-fermat-spiral path of a pikachu input.

[![Pikachu Output](https://github.com/ejbosia/connected-fermat-spirals/raw/main/examples/pikachu_output.png)](https://github.com/ejbosia/connected-fermat-spirals/blob/main/examples/pikachu_output.png)

## References

Haisen Zhao, Fanglin Gu, Qi-Xing Huang, Jorge Garcia, Yong Chen, Changhe Tu, Bedrich Benes, Hao Zhang, Daniel Cohen-Or, and Baoquan Chen. 2016. Connected fermat spirals for layered fabrication. ACM Trans. Graph. 35, 4, Article 100 (July 2016), 10 pages. DOI:[https://doi.org/10.1145/2897824.2925958](https://doi.org/10.1145/2897824.2925958)