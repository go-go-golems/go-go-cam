---
Title: Production Deployment Design and Implementation Guide
Ticket: MILL-05
Status: active
Topics:
    - cnc
    - frontend
    - deployment
    - gitops
    - kubernetes
    - research
    - toolpath-generation
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: abs:///home/manuel/code/wesen/2026-03-27--hetzner-k3s/gitops/applications/cam.yaml
      Note: Argo CD production Application
    - Path: repo://.github/workflows/publish-image.yaml
      Note: GHCR and GitOps release handoff
    - Path: repo://Dockerfile
      Note: Production static image build
    - Path: repo://src/lib/fermat.ts
      Note: Connected Fermat-style pocketing adaptation
    - Path: repo://src/lib/imaging.ts
      Note: Thresholding, morphology, distance field, and thinning algorithms
    - Path: repo://src/lib/operations.ts
      Note: Makera-style G-code emission and Z safety scheme
    - Path: repo://src/lib/pipeline.ts
      Note: Image-to-toolpath orchestration and depth cap
ExternalSources:
    - https://haisenzhao.github.io/CFS/index.html
    - https://dl.acm.org/doi/10.1145/2897824.2925958
    - https://docs.opencv.org/4.13.0/d7/d4d/tutorial_py_thresholding.html
    - https://bioimagebook.github.io/chapters/2-processing/5-morph/morph.html
    - https://cs.brown.edu/people/pfelzens/papers/dt-final.pdf
    - https://dl.acm.org/doi/pdf/10.1145/357994.358023
    - https://en.wikipedia.org/wiki/Ramer%E2%80%93Douglas%E2%80%93Peucker_algorithm
    - https://github.com/gnea/grbl/blob/master/doc/markdown/commands.md
    - https://docs.vectric.com/docs/V12.0/VCarveDesktop/ENU/Help/form/VCarve%20Toolpath%20Creator/
Summary: Design and implementation guide for deploying the browser-only ABS Bicolor V-Engraver as cam.yolo.scapegoat.dev through GHCR, Vault, Argo CD, and k3s.
LastUpdated: 2026-08-01T14:30:00-04:00
WhatFor: Onboarding an intern to the image-to-toolpath application and its production delivery path.
WhenToUse: Before changing the CAM algorithms, the G-code contract, or the production deployment.
---


# Production Deployment Design and Implementation Guide

## Executive summary

This ticket turns the Vite application in `/home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable` into a production static web application at `https://cam.yolo.scapegoat.dev`. The application is the **ABS Bicolor V-Engraver**: it accepts a raster image in the browser, creates a cleaned binary engraving mask, computes tool-center geometry, emits multi-tool Makera/GRBL-style G-code, and renders both the generated program and uploaded programs in a browser visualizer.

There is no application server, database, login flow, or server-side image upload. All artwork and G-code processing happens in the browser. Production therefore needs three distinct things:

- A reproducible static web artifact built by Vite and served by Nginx.
- A release handoff that publishes an immutable GHCR image and opens a GitOps pull request.
- A k3s/Argo CD package that serves the image over HTTPS at `cam.yolo.scapegoat.dev`.

The implementation added to the source repository is deliberately small: `Dockerfile`, `nginx.conf`, `.dockerignore`, `deploy/gitops-targets.json`, the reusable GitHub Actions caller, and a pinned `packageManager` entry. The cluster-side package is in `wesen/2026-03-27--hetzner-k3s`, with a dedicated `cam` namespace, AppProject destination, Vault image-pull contract, Deployment, Service, Ingress, and NetworkPolicy.

> **Important safety boundary:** the generated G-code controls a real cutting machine. A green web deployment does not validate machining safety. Every production acceptance run must include simulation, work-offset verification, Z-zero verification, an air cut, and a stepped depth test on scrap.

## 1. Problem statement and scope

### 1.1 The product problem

A user needs a reliable, inspectable way to turn an image into shallow engraving paths for thin ABS bicolor stock. The application must preserve enough detail for narrow regions, clear broad regions efficiently, cap V-bit depth to the measured top-layer thickness plus a breakthrough margin, and produce a program compatible with the Makera-style workflow already represented by `testdata/MakeraBadge.nc`.

The input is not a vector drawing. It is a raster image with possible alpha, antialiasing, white borders, noise, holes, disconnected islands, and arbitrary scale. The system must therefore make the raster-to-machining decisions explicit and previewable rather than hiding them in a server-side black box.

### 1.2 Deployment problem

The application currently builds with Vite but did not yet have a production container, image publishing workflow, GitOps target metadata, or a cluster Application. The deployment must fit the platform's control-plane boundaries:

1. The source repository owns TypeScript, tests, the Docker build, and the image-publishing workflow.
2. The GitOps repository owns the desired Kubernetes state, image pin, ingress, namespace, and secret wiring.
3. Terraform owns DNS. In this environment, `*.yolo.scapegoat.dev` already points at the k3s ingress, so `cam.yolo.scapegoat.dev` does not require a new DNS record; this still must be checked in Terraform before rollout.
4. Vault owns secret values. The application has no runtime secret, but a private GHCR package requires an image-pull credential.
5. Argo CD owns reconciliation after the first `Application` object is bootstrapped.

### 1.3 In scope

- Production static serving at `https://cam.yolo.scapegoat.dev`.
- Reproducible Node/pnpm build and container image.
- GHCR publishing and GitOps PR handoff.
- Vault-backed private-image pull secret contract.
- k3s Deployment, Service, Ingress, NetworkPolicy, and Argo Application.
- Algorithm and codebase orientation for a new intern.
- Tests, build validation, rendered-manifest validation, and post-deploy acceptance.

### 1.4 Out of scope

- Sending G-code to a CNC machine from the browser.
- Persistent user accounts, server-side storage, or multi-user authorization.
- Automatic machine-specific postprocessors beyond the existing Makera-oriented dialect.
- Replacing the current chamfer distance field with an exact Euclidean distance transform.
- Reimplementing the full Connected Fermat Spirals paper; the current implementation is an adaptation described below.
- Provisioning a new k3s cluster or installing Argo CD, Vault, VSO, Traefik, or cert-manager.

## 2. System orientation for an intern

### 2.1 Repository and runtime map

The source repository is `go-go-golems/go-go-cam` and is checked out locally at:

```text
/home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable
```

The relevant source layout is:

```text
index.html                         browser structure and controls
src/main.ts                        DOM wiring and application state
src/lib/imaging.ts                 rasterization, thresholding, morphology, EDT-like field, thinning
src/lib/pipeline.ts                image-to-model-to-operations orchestration
src/lib/geometry.ts                RDP, loop tracing, skeleton graph tracing
src/lib/toolpath.ts                pixel/machine mapping and raster/detail paths
src/lib/pocketing.ts               distance-field contour pocketing
src/lib/fermat.ts                  connected Fermat-style pocketing adaptation
src/lib/operations.ts              Makera-style multi-tool G-code emission
src/gcode/parser.ts                G-code parser and statistics model
src/gcode/viewer.ts                interactive G-code visualizer
src/lib/*test.ts                   algorithm and G-code contract tests
testdata/MakeraBadge.nc            real MakeraStudio reference program
gcode-tests*/                      generated test jobs and sidecar settings
Dockerfile                         two-stage Vite build plus Nginx runtime
nginx.conf                         health endpoint, fallback, and security headers
deploy/gitops-targets.json         shared workflow's GitOps patch contract
.github/workflows/publish-image.yaml  reusable release workflow caller
```

The browser owns the mutable state. `AppState` in `src/main.ts` holds the loaded image, processed model, toolpaths, generated G-code, SVG, settings, and warnings. The processing pipeline is DOM-free, which is important: `scripts/generate-test-gcode.ts` can run the same core logic in Node for deterministic batch fixtures.

### 2.2 End-to-end architecture

```mermaid
flowchart LR
    USER[Browser user] --> UI[index.html + src/main.ts]
    UI --> FILE[File API / Canvas]
    FILE --> IMG[imaging.ts]
    IMG --> PIPE[pipeline.ts]
    PIPE --> POCKET[pocketing.ts / fermat.ts]
    PIPE --> DETAIL[geometry.ts + toolpath.ts]
    PIPE --> GCODE[operations.ts]
    GCODE --> VIEWER[gcode/parser.ts + viewer.ts]
    GCODE --> DOWNLOAD[Download .nc / SVG / PNG]

    SRC[go-go-golems/go-go-cam] --> CI[GitHub Actions]
    CI --> GHCR[GHCR immutable image]
    CI --> PR[GitOps PR]
    PR --> K3S[wesen/2026-03-27--hetzner-k3s]
    K3S --> ARGO[Argo CD Application cam]
    ARGO --> POD[k3s Deployment + Nginx]
    DNS[Terraform wildcard *.yolo] --> TLS[Traefik + cert-manager]
    TLS --> POD
    VAULT[Vault image-pull record] --> VSO[VSO]
    VSO --> POD
```

The application can be understood as two pipelines joined at the artifact boundary:

- **Geometry pipeline:** pixels become a `Model`, then legal machine-space `Toolpath` values, then `Operation` values.
- **Delivery pipeline:** source commit becomes a container image, then a GitOps image pin, then an Argo-managed Pod.

Do not conflate these pipelines. A successful Docker build does not prove toolpath correctness. A healthy Pod does not prove a generated job is safe to cut.

## 3. Algorithmic pipeline

### 3.1 Rasterization and alpha compositing

`rasterizeImage` in `src/lib/imaging.ts` draws the source into a bounded canvas. It fills the canvas white before drawing, so transparent pixels are treated as white rather than black. Each pixel is converted to luminance with the standard Rec. 601-style weights:

```text
alpha = A / 255
r' = 255 - alpha * (255 - R)
g' = 255 - alpha * (255 - G)
b' = 255 - alpha * (255 - B)
gray = round(0.299*r' + 0.587*g' + 0.114*b')
```

This is a practical engraving choice: transparent artwork does not accidentally become engraved material. The `maxDimension` setting bounds CPU and memory cost before the image enters the pixel algorithms.

### 3.2 Threshold selection: Otsu or manual

`otsuThreshold` computes a 256-bin histogram and selects the threshold that maximizes between-class variance. For a candidate threshold `t`, let `w_b` and `w_f` be background and foreground weights, and `mu_b` and `mu_f` their means. The score is:

```text
sigma_between²(t) = w_b(t) * w_f(t) * (mu_b(t) - mu_f(t))²
```

The implementation scans all values once while maintaining cumulative counts and sums. Complexity is `O(N + 256)` for `N` pixels. `makeMask` then chooses dark pixels for engraving, or light pixels when inversion is enabled.

The OpenCV thresholding reference in `sources/03-opencv-thresholding.md` is useful because it distinguishes fixed, adaptive, binary-inverted, and Otsu thresholding. Otsu is not magic: it assumes a useful histogram separation. The UI therefore exposes manual threshold and inversion for material photographs or artwork whose histogram violates that assumption.

### 3.3 Morphological cleanup

The pipeline applies opening, closing, and connected-component filtering:

```text
opening = dilation(erosion(mask, structuring_element))
closing = erosion(dilation(mask, structuring_element))
```

`boxMorph` uses an integral image, so a square-neighborhood sum can be queried in constant time per pixel after an `O(N)` prefix pass. Opening removes small bright/foreground protrusions; closing repairs small gaps. The radius is deliberately small and user-controlled because morphology changes machinable geometry.

`removeSmallComponents` uses an 8-connected breadth-first search. It removes foreground components whose pixel area is below `minArea`. Eight-connectivity is appropriate for diagonal artwork strokes, but it also means diagonal touching pixels become one region; tests and preview inspection must cover that tradeoff.

The Bioimage Analysis morphology reference in `sources/04-bioimage-morphology.md` explains why opening and closing are not interchangeable filters. The operation order is part of the contract: changing it can turn a broken letter into a connected island or erase a narrow stroke.

### 3.4 Crop and coordinate model

When `autoCrop` is enabled, `foregroundBounds` finds the minimal foreground rectangle. The pipeline adds configurable padding, and adds additional padding when cutout mode is enabled so the outside contour has room for the cutout margin, flat-tool radius, and safety buffer.

The `Model` records:

```text
width, height        processed pixel dimensions
finishedWidth        requested physical width in millimetres
finishedHeight       width * height / width
mmPerPx              finishedWidth / width
mask, rgba           processed data and preview pixels
settings             immutable-ish run settings
centerMask, residual derived regions after planning
```

`pixelToMachine` flips the image Y axis into the machine coordinate convention, applies optional X/Y mirroring, then applies the user origin offsets. `machineToPixel` is its inverse for the Fermat start hint and visual diagnostics. Every geometry algorithm works in pixel coordinates until the path is accepted; conversion is centralized in `src/lib/toolpath.ts`.

### 3.5 Chamfer distance field

`chamferDistance` computes an approximate Euclidean distance to a foreground or background set using two raster passes. Orthogonal neighbors cost `1`; diagonal neighbors cost `sqrt(2)`. The forward pass checks left/up neighbors, and the backward pass checks right/down neighbors.

```pseudo
seed each pixel to 0 if it is a seed, otherwise INF
for y from top to bottom:
  for x from left to right:
    d[p] = min(d[p], d[left] + 1, d[up] + 1,
               d[up-left] + sqrt(2), d[up-right] + sqrt(2))
for y from bottom to top:
  for x from right to left:
    d[p] = min(d[p], d[right] + 1, d[down] + 1,
               d[down-right] + sqrt(2), d[down-left] + sqrt(2))
return d
```

The distance field is the bridge between image shape and cutter geometry. `distanceToBackground` identifies how far a foreground pixel is from leaving the artwork. Subtracting the V-bit radius produces a legal tool-center region. The implementation is a chamfer approximation, not the exact linear-time Euclidean transform in Felzenszwalb and Huttenlocher; that distinction matters if a future intern replaces it.

The paper record in `sources/05-distance-transforms-paper-html.md` and the original PDF URL record in `sources/05-distance-transforms-paper.md` explain the exact transform and why it is useful for binary images. Do not silently call the current implementation an exact EDT.

### 3.6 V-bit geometry and depth cap

The UI computes a target depth from measured material properties:

```text
D = capThickness + breakthrough
halfAngle = includedAngle / 2
surfaceWidth = 2 * D * tan(halfAngle)
toolRadius = surfaceWidth / 2
```

For a narrow detail with local half-width `w`, the ideal depth is:

```text
depth = w / tan(halfAngle)
depth = clamp(depth, minimumSafeDepth, targetDepth)
```

The cap is essential for thin ABS: unrestricted V-carving can cut through the contrasting cap layer and damage the base. `src/lib/pipeline.ts` computes the target geometry; `src/lib/toolpath.ts` computes detail depths from the distance field. Vectric's V-carve reference in `sources/09-vcarve-toolpath-reference.md` describes the same central relationship between cutter angle, width, and variable depth.

### 3.7 Broad-region clearing

The pipeline optionally uses a flat end mill for wide regions. It computes a flat-tool center region from the distance field, plans contour-parallel flat paths, and then subtracts the region reachable by that tool from the engraving mask. The V-bit is then used as a rest-machining tool for the residual shape.

Without flat clearing, the broad pocket strategy is selected by `settings.pocketStrategy`:

- `raster`: scanline runs with connector tracking in `makeRasterPaths`.
- `contour`: nested distance-field iso-contours in `makeContourPocketPaths`.
- `fermat`: connected Fermat-style paths in `makeFermatPocketPaths`.

The raster implementation preserves tracks across neighboring scanlines when a connector remains inside the center mask. This reduces retracts without pretending that disconnected runs are connected. The contour implementation extracts shrinking iso-level loops and can link compatible rings. Both are pixel-grid approximations and must be checked in the G-code viewer.

### 3.8 Connected Fermat-style pocketing

The research source at `sources/01-connected-fermat-spirals-project.md` and the ACM paper record describe Connected Fermat Spirals (CFS): decompose a connected region into subregions, fill each with a continuous Fermat spiral, then connect the local paths by a graph traversal. The goal is a globally continuous path with long low-curvature motion.

The implementation in `src/lib/fermat.ts` is intentionally documented as an adaptation, not a full reproduction of the paper:

1. `collectRings` generates nested distance-field loops.
2. `buildLoopForest` creates levels and attaches each deeper loop to the nearest loop at the previous level.
3. `decomposeChain` groups single-child nested loops into chains and leaves branches as child chains.
4. `fermatChainPath` opens each loop at an anchor, leaves a gap corridor, walks alternating rings inward, then walks the opposite parity outward.
5. `splice` inserts child-chain paths at their nearest parent vertex.
6. Close paths near a common boundary are merged when their endpoint distance is within `4 * stepover`.
7. RDP simplification converts dense pixel-space points into machine-space points.

```pseudo
rings = collectRings(distanceField, toolRadius, stepover)
forest = buildLoopForest(rings)
paths = []
for root in forest:
    chain = decomposeChain(root)
    path = fermatChainPath(chain.loops, stepover, startHint)
    for child in chain.children:
        path = splice(path, buildChainPath(child, stepover, attachmentHint))
    paths.append(path)
while two paths have nearby endpoints:
    splice them
simplify each path with RDP tolerance
convert pixels to machine millimetres
```

The important invariants are tested in `src/lib/fermat.test.ts`: a disk is one open path; annular boundaries merge; a dumbbell reaches both lobes; path points stay inside the legal center region; and total length remains comparable to contour filling. These tests are geometric regression tests, not machine-safety certification.

### 3.9 Narrow detail extraction

After broad coverage, the pipeline computes a residual region. It applies Zhang-Suen thinning to reduce the residual to a one-pixel skeleton. The implementation uses two deletion subpasses per iteration and preserves pixels when the neighborhood topology would break.

For each skeleton pixel, `traceSkeletonPolylines` builds a graph using 8-neighborhood degree. Paths start at endpoints and branch points; unvisited degree-two cycles are handled afterward. `simplifyRdp` reduces the polyline while respecting a physical tolerance. Each retained point receives a variable depth from the original distance field.

Zhang and Suen's original algorithm is archived through the source URL and a Defuddle-extracted explanatory page in `sources/06-zhang-suen-thinning-html.md`. The algorithm's preservation condition is not merely cosmetic: deleting a junction can change one connected engraving detail into two unrelated cuts.

### 3.10 Ramer-Douglas-Peucker simplification

`src/lib/geometry.ts` implements iterative RDP. It keeps the first and last points, finds the maximum point-to-segment distance, and recursively (via an explicit stack) splits whenever that distance exceeds the squared tolerance.

```pseudo
keep first and last
stack = [(first, last)]
while stack not empty:
    segment = pop()
    p = interior point farthest from segment
    if distance(p, segment) > tolerance:
        keep p
        push(left segment)
        push(right segment)
return points whose keep flag is set
```

The tolerance is converted from millimetres to pixels before simplification. This prevents a UI setting from changing meaning when the image resolution changes. Closed loops use a farthest-point strategy to choose a stable seam before simplifying two wrapped chains.

The RDP source in `sources/07-rdp-algorithm.md` is a useful general reference. It also highlights the reason to test self-intersection and corner preservation when simplifying toolpaths: fewer commands are valuable only if the simplified curve stays within the intended boundary.

### 3.11 Operations and G-code

`src/lib/operations.ts` translates toolpaths into a multi-tool program. The generated dialect includes:

- `G21`: millimetres.
- `G90`: absolute coordinates.
- `G17`: XY plane.
- `G94`: feed per minute.
- `G0`: rapid motion.
- `G1`: cutting and plunge motion.
- `Tn M6`: tool change.
- `Sn M3`: spindle clockwise on.
- `M5`: spindle off.
- `G28`, `M2`: final home/program end.
- `;@MKR|...`: Makera metadata and toolpath markers.

The three Z heights are deliberately separate:

```text
clearance: safe travel, operation boundaries, and tool changes
approach:  rapid descent before a feed plunge
hop:       short-reposition retract, followed by a feed re-engage
```

For a short reposition, the emitter uses hop height and a feed re-engage. For a long reposition, it returns to clearance. For a deeper ladder pass at the same XY, it continues straight down rather than inserting an unnecessary lift. The behavior is covered by `src/lib/pocketing.test.ts`.

`src/gcode/parser.ts` is not a full RS-274 interpreter. It supports the dialects this application needs, including linear moves, XY arcs, units, absolute/incremental mode, tools, spindle events, Makera metadata, bounds, and estimated motion time. The GRBL command reference is archived in `sources/08-grbl-commands.md`; consult the target sender/controller before adding a new command.

## 4. Public and internal APIs

### 4.1 Pipeline API

The core entry point is:

```ts
export async function runPipeline(
  input: PipelineInput,
  settings: Settings,
  jobName: string,
  onStatus?: (message: string) => void,
): Promise<PipelineResult>
```

`PipelineInput` requires `width`, `height`, and grayscale pixels; RGBA is optional for previews. `PipelineResult` returns the `Model`, `Operation[]`, generated G-code, SVG, threshold, step size, broad/residual counts, and parsed statistics.

The contract is:

- Throw when thresholding removes every foreground pixel.
- Throw when no toolpaths can be generated.
- Keep settings and coordinate transforms consistent for every path family.
- Return G-code that round-trips through `parseGcode`.

### 4.2 Geometry APIs

Important symbols for an intern:

```ts
rasterizeImage(img, maxDimension): RasterImage
otsuThreshold(gray): number
morphologicalOpen(mask, width, height, radius): Uint8Array
morphologicalClose(mask, width, height, radius): Uint8Array
chamferDistance(mask, width, height, zeroAtForeground): Float32Array
zhangSuenThin(mask, width, height, progress?): Promise<Uint8Array>
traceBoundaryLoops(mask, width, height): Point[][]
simplifyRdp(points, tolerance): Point[]
```

Do not add a second pixel-to-machine conversion in an individual algorithm. Use `pixelToMachine` and `machineToPixel` from `src/lib/toolpath.ts`.

### 4.3 Toolpath and G-code APIs

```ts
makeRasterPaths(centerMask, model): RasterPathsInfo
makeContourPaths(centerMask, model): Toolpath[]
makeDetailPaths(skeleton, originalDistance, model): Toolpath[]
makeContourPocketPaths(dist, model, toolRadiusPx, stepoverPx, depth): Toolpath[]
makeFermatPocketPaths(dist, model, toolRadiusPx, stepoverPx, depth, startHint): Toolpath[]
generateProgram(operations, model, jobName): string
parseGcode(text): ParsedGcode
```

A `Toolpath` contains a `kind`, `points`, optional constant `depth`, and `closed` flag. Detail points carry their own `depth`. An `Operation` owns a tool, paths, and a pass-depth ladder. The emitter assumes `path.points` are already in machine millimetres and that negative Z is below the measured surface.

## 5. Production delivery design

### 5.1 Source image

The source repository now contains:

```text
Dockerfile
nginx.conf
.dockerignore
package.json                    packageManager: pnpm@10.13.1
.github/workflows/publish-image.yaml
deploy/gitops-targets.json
```

The Docker build has two stages. The build stage installs the locked pnpm dependency graph and runs `pnpm build`; the runtime stage copies only `dist/` into Nginx. Nginx exposes `/healthz`, serves static assets, falls back to `index.html`, and emits basic browser security headers.

The package manager field is necessary for reproducibility. Without it, Corepack selected pnpm 11 in a clean container and the install failed on ignored dependency build scripts. With `pnpm@10.13.1`, the image build succeeds and the lockfile remains authoritative.

### 5.2 CI contract

The caller invokes:

```yaml
uses: go-go-golems/infra-tooling/.github/workflows/publish-ghcr-image.yml@main
```

It sets `setup_go: false` because this is a TypeScript application, and the test command installs the locked frontend dependencies before running Vitest. The reusable workflow still builds and pushes the Docker image, then patches the GitOps target using the generated immutable `sha-<7-character>` tag.

The GitHub App mode is required. The Vault role is `cam-gitops-pr`; its intended source repository claim is `go-go-golems/go-go-cam`, while the GitOps installation token is scoped to `wesen/2026-03-27--hetzner-k3s`. Do not use a PAT fallback.

### 5.3 GitOps contract

The cluster repository contains `gitops/kustomize/cam/` and `gitops/applications/cam.yaml`. The package has this wave layout:

| Wave | Resources |
| ---: | --- |
| -3 | Namespace |
| -2 | ServiceAccount, VaultConnection, VaultAuth |
| -1 | VaultStaticSecret rendering `cam-ghcr-pull` |
| 1 | Nginx Deployment |
| 2 | Service, Ingress, NetworkPolicy |

The image-pull Secret is a VSO projection of `kv/apps/cam/prod/image-pull`. The Kubernetes policy can read only that path. The static app has no other runtime secret and no persistent volume.

The Deployment is non-root, read-only-root-filesystem, capability-dropped, and gives Nginx memory-backed writable mounts for its PID, cache, and temporary files. The NetworkPolicy admits HTTP only from Traefik and DNS egress only. Because the app is static, it needs no PostgreSQL, external API, or SMTP egress.

### 5.4 DNS and TLS

`cam.yolo.scapegoat.dev` is covered by the existing `*.yolo.scapegoat.dev` A record in `terraform/dns/zones/scapegoat-dev/envs/prod/main.tf`, pointing to `91.98.46.169`. Confirm this remains true before rollout; do not add a duplicate record if the wildcard still covers the hostname. cert-manager requests `cam-tls` through the `letsencrypt-prod` ClusterIssuer, and Traefik serves the HTTPS Ingress.

## 6. Deployment runbook

### Phase 0: local verification

Run from the source repository:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
docker build -t cam:local .
docker run --rm -p 8080:80 cam:local
curl -fsS http://127.0.0.1:8080/healthz
```

Open `http://127.0.0.1:8080`, load the embedded cat sample, choose each pocket strategy, generate G-code, inspect the visualizer, and download the `.nc` file. The output must remain a browser download; the server must never receive artwork.

### Phase 1: GitHub and Vault prerequisites

The GitHub repository is `go-go-golems/go-go-cam`. Before enabling the first push workflow:

1. Confirm the repository's package publishing permission allows `GITHUB_TOKEN` to publish GHCR.
2. Create or verify the `cam-gitops-pr` GitHub Actions Vault role and policy.
3. Seed `kv/ci/github/cam/gitops-pr-app` with the approved GitHub App `app_id` and `private_key` without printing the values.
4. Seed `kv/apps/cam/prod/image-pull` if GHCR is private. Its contract is `server`, `username`, `password`, and base64 `auth`.
5. Apply the Kubernetes Vault policy and role from `vault/policies/kubernetes/cam.hcl` and `vault/roles/kubernetes/cam.json`.

The policy and role files are durable declarations; `scripts/bootstrap-vault-*-auth.sh` applies them. A file in Git does not create the live Vault object until the bootstrap script is run.

### Phase 2: Source release

```bash
git push origin main
```

Verify the new workflow run starts. A pull-request run must test and build but not push an image or open a GitOps PR. A `main` push must:

- run `pnpm install --frozen-lockfile && pnpm test`;
- build the Nginx image;
- publish `ghcr.io/go-go-golems/go-go-cam:sha-<sha>`;
- authenticate to Vault using the `cam-gitops-pr` role;
- open a GitOps PR against `wesen/2026-03-27--hetzner-k3s`.

Inspect the PR actor, not the commit author. GitHub App mode should show the GitOps app actor. The workflow hardcodes the commit author to `github-actions[bot]` in all modes.

### Phase 3: GitOps validation and first bootstrap

In the cluster repository:

```bash
cd /home/manuel/code/wesen/2026-03-27--hetzner-k3s
bash scripts/validate_gitops.sh
kubectl kustomize gitops/kustomize/cam >/tmp/cam.yaml
kubectl apply --dry-run=client -f /tmp/cam.yaml
```

Merge the GitOps PR after reviewing the immutable image pin. A new Application is not automatically created merely because `gitops/applications/cam.yaml` is in Git. On the first install, apply the AppProject and Application explicitly:

```bash
export KUBECONFIG=$PWD/kubeconfig-<tailscale-host>.yaml
kubectl apply -f gitops/projects/prod-apps.yaml
kubectl apply -f gitops/applications/cam.yaml
kubectl -n argocd annotate application cam argocd.argoproj.io/refresh=hard --overwrite
```

Later image updates use the existing Application and require only the reviewed GitOps PR merge.

### Phase 4: cluster and browser acceptance

```bash
kubectl -n argocd get application cam
kubectl -n cam get pod,service,ingress,secret
kubectl -n cam describe certificate cam-tls
kubectl -n cam rollout status deployment/cam --timeout=180s
curl -fsS https://cam.yolo.scapegoat.dev/healthz
curl -fsS https://cam.yolo.scapegoat.dev/ | head
```

The expected state is `Synced/Healthy`, one Ready pod, a `kubernetes.io/dockerconfigjson` pull Secret if GHCR is private, a Ready certificate, and HTTPS content from the generated Vite bundle.

Then perform browser acceptance:

- Load the application over HTTPS with no console errors.
- Load the embedded cat sample.
- Upload PNG, JPEG, WebP, and BMP fixtures where supported.
- Exercise Otsu, manual threshold, inversion, crop, and cleanup controls.
- Generate raster, contour, and Fermat pockets.
- Exercise optional flat clearing and cutout passes.
- Download G-code, SVG, and mask PNG.
- Load generated G-code and a fixture `.nc` file in the visualizer.
- Confirm toolpath summaries, bounds, depth coloring, tool markers, spindle events, and progress slider.
- Verify that the server sees no artwork upload; all processing remains local.

For machining acceptance, simulate the G-code, inspect work offsets and tool numbers, perform an air cut, and run a stepped depth test on scrap ABS before cutting a finished part.

## 7. Validation strategy

### 7.1 Existing automated checks

The source repository currently has two Vitest files with 18 tests. Run:

```bash
pnpm test
pnpm build
```

The tests cover:

- nested and split contour rings;
- no-fit tool geometry;
- contour-linking path count and geometry;
- Fermat disk, annulus, dumbbell, and legal-region behavior;
- pass ladders;
- Makera metadata and tool ordering;
- spindle stop before tool change;
- hop versus full clearance cycles;
- direct deepening on ladder passes;
- empty operation omission.

### 7.2 Deployment checks

Use these checks at each boundary:

| Boundary | Evidence |
| --- | --- |
| TypeScript | `pnpm test`, `pnpm build` |
| Container | `docker build`, local `/healthz`, non-root runtime |
| GHCR | immutable image exists for the commit SHA |
| GitOps | `validate_gitops.sh`, Kustomize render, dry-run |
| Vault | role/policy applied, VSO Ready, pull Secret key present without decoding it |
| Argo | Application `Synced/Healthy`, rollout complete |
| TLS | trusted certificate and exact HTTPS hostname |
| Browser | no console errors, all downloads and visualizer behavior pass |
| CNC safety | simulator, air cut, depth coupon, machine-specific review |

### 7.3 Future tests worth adding

- A browser smoke test using Playwright against the built static server.
- A fixture-based pipeline test that asserts the generated G-code parses and has bounded Z depth.
- A CSP test that loads the app and asserts no blocked required resource.
- A container test that starts as UID 101 and serves `/healthz`.
- A manifest test that asserts the image, host, namespace, and Service selector agree.
- Golden SVG/G-code snapshots for the cat sample and each test-pattern family.
- A property test that every emitted cutting point lies in the intended mask or legal center region, within the documented raster tolerance.

## 8. Design decisions

### Decision: browser-local processing

- **Context:** Artwork may be private and the current pipeline is already DOM-free and invoked from browser state.
- **Options considered:** browser-only processing; upload to a server; a worker service.
- **Decision:** browser-only processing.
- **Rationale:** no image retention, no server-side attack surface, simple static deployment, and direct visual feedback.
- **Consequences:** large images consume browser CPU/memory; processing cannot be centrally audited; users must download and validate G-code themselves.
- **Status:** accepted.

### Decision: Nginx static container rather than a Node runtime

- **Context:** Vite emits static assets and there is no runtime API.
- **Options considered:** Node `vite preview`; Node/Express server; Nginx.
- **Decision:** multi-stage build with Nginx runtime.
- **Rationale:** smaller runtime responsibility, conventional static serving, explicit health endpoint, and no development server in production.
- **Consequences:** any future server API requires a separate service or runtime design; Nginx UID and writable paths must remain compatible with the pod security context.
- **Status:** accepted.

### Decision: GHCR plus GitOps image handoff

- **Context:** this k3s platform reconciles desired state from the GitOps repository and already provides a shared image-publish workflow.
- **Options considered:** manual `kubectl set image`; direct CI cluster credentials; GHCR plus GitOps PR.
- **Decision:** GHCR immutable image followed by a reviewed GitOps PR.
- **Rationale:** separates build credentials from cluster authority, preserves an auditable image pin, and uses the existing Argo operating model.
- **Consequences:** first installation needs explicit Application bootstrap; a release can stop at any boundary and needs boundary-specific diagnostics.
- **Status:** accepted.

### Decision: Vault-backed pull Secret even for a static app

- **Context:** the source repository is public, but package visibility and organization policy may make GHCR pulls private; Kubernetes Secrets must not be committed.
- **Options considered:** public package with anonymous pulls; inline Docker config Secret; Vault/VSO projection.
- **Decision:** VSO projection of `kv/apps/cam/prod/image-pull`; omit the credential only if the package is explicitly public and verified by a clean pull.
- **Rationale:** preserves least-privilege and makes a later package-visibility change an operational secret update rather than a manifest rewrite.
- **Consequences:** first deployment depends on Vault policy/role and a seeded value; VSO Secret readiness becomes part of the rollout.
- **Status:** accepted.

### Decision: retain chamfer distance as the current distance field

- **Context:** the existing pipeline is pixel-based and has a tested two-pass chamfer implementation.
- **Options considered:** retain chamfer; implement exact Felzenszwalb-Huttenlocher EDT; add a geometry library.
- **Decision:** retain chamfer for this deployment.
- **Rationale:** deployment should not mix an algorithm migration with a release migration; current tests define the existing behavior.
- **Consequences:** small geometric error remains near diagonal boundaries; a future exact-EDT change needs geometry and G-code regression tests.
- **Status:** accepted.

### Decision: call the Fermat implementation an adaptation

- **Context:** the CFS paper decomposes arbitrary connected regions and connects subregion spirals through a graph traversal; the code uses distance-field rings, nearest-loop parenting, chain paths, and splicing.
- **Options considered:** claim full CFS equivalence; remove the strategy; document the adaptation and test its invariants.
- **Decision:** document it as a Connected Fermat-style adaptation.
- **Rationale:** accurate attribution protects future maintainers from assuming stronger guarantees than the implementation provides.
- **Consequences:** complex concave regions need fixture validation and possibly future topology improvements.
- **Status:** accepted.

## 9. Risks, alternatives, and open questions

### Risks

- A thin ABS cap can be cut through if the measured `capThickness` is wrong.
- A browser can freeze or run out of memory on an oversized image; `maxDimension` is a guard, not a formal resource budget.
- Chamfer distance and pixel contours introduce grid quantization.
- Path simplification can change narrow corners or produce an unsafe near-boundary path if tolerance is too large.
- G-code syntax accepted by the parser may still be rejected or interpreted differently by a sender/controller.
- The current workflow's `@main` dependency is mutable; pinning a reviewed infra-tooling ref would improve supply-chain reproducibility.
- The GitHub Actions role binds push to `main`; manual workflow dispatch is intentionally not a valid GitOps release path.
- The first deployment is blocked until the GitHub App credential path and, if needed, GHCR pull path are seeded in Vault.

### Alternatives

- **Cloudflare Pages:** simpler static hosting, but bypasses the requested k3s/Argo platform and the existing release train.
- **Shared static-sites host:** avoids one Deployment per app, but couples this application to a content host and makes the image/GitOps contract less direct.
- **Public GHCR package:** removes the pull Secret, but changes package visibility and access policy; use only with explicit approval.
- **Exact Euclidean distance transform:** potentially improves geometry, but is an algorithm change outside this deployment ticket.
- **Server-side CAM worker:** could provide queueing and heavier processing, but would require authentication, uploads, persistence, and a new threat model.

### Open questions

1. Should the GHCR package remain public, or should `kv/apps/cam/prod/image-pull` be seeded and retained?
2. Should the reusable workflow ref move from `@main` to a reviewed commit after the first successful rollout?
3. What exact Makera machine profile and sender version are the acceptance targets for G-code?
4. Should the UI eventually expose a machine profile instead of hard-coding Makera metadata defaults?
5. Should a future ticket replace chamfer distance with exact EDT and add property-based geometry bounds tests?

## 10. References and file index

### Source files

- `/home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/index.html` — application controls, preview canvases, downloads, and visualizer.
- `/home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/src/main.ts` — browser event wiring and `AppState`.
- `/home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/src/lib/imaging.ts` — image algorithms.
- `/home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/src/lib/pipeline.ts` — orchestration and depth cap.
- `/home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/src/lib/toolpath.ts` — coordinate transform and path construction.
- `/home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/src/lib/geometry.ts` — simplification and graph tracing.
- `/home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/src/lib/pocketing.ts` — contour pocketing.
- `/home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/src/lib/fermat.ts` — Fermat-style pocketing.
- `/home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/src/lib/operations.ts` — G-code emitter.
- `/home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/src/gcode/parser.ts` — parser and statistics.
- `/home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/src/lib/fermat.test.ts` — Fermat invariants.
- `/home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/src/lib/pocketing.test.ts` — contour and G-code invariants.

### Deployment files

- `/home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/Dockerfile`
- `/home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/nginx.conf`
- `/home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/.github/workflows/publish-image.yaml`
- `/home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/deploy/gitops-targets.json`
- `/home/manuel/code/wesen/2026-03-27--hetzner-k3s/gitops/kustomize/cam/`
- `/home/manuel/code/wesen/2026-03-27--hetzner-k3s/gitops/applications/cam.yaml`
- `/home/manuel/code/wesen/2026-03-27--hetzner-k3s/gitops/projects/prod-apps.yaml`
- `/home/manuel/code/wesen/2026-03-27--hetzner-k3s/vault/policies/kubernetes/cam.hcl`
- `/home/manuel/code/wesen/2026-03-27--hetzner-k3s/vault/roles/kubernetes/cam.json`
- `/home/manuel/code/wesen/2026-03-27--hetzner-k3s/vault/policies/github-actions/cam-gitops-pr.hcl`
- `/home/manuel/code/wesen/2026-03-27--hetzner-k3s/vault/roles/github-actions/cam-gitops-pr.json`
- `/home/manuel/code/wesen/terraform/dns/zones/scapegoat-dev/envs/prod/main.tf` — existing wildcard DNS.

### Archived web research

The full Defuddle extracts and URL records are stored under this ticket's `sources/` directory. Start with the CFS project page, OpenCV thresholding tutorial, morphology chapter, distance transform paper record, Zhang-Suen explanation, RDP article, GRBL command reference, and V-carve reference.
