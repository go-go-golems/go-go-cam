---
Title: Investigation Diary
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
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: abs:///home/manuel/code/wesen/2026-03-27--hetzner-k3s/gitops/kustomize/cam
      Note: Cluster-side desired state
    - Path: abs:///home/manuel/code/wesen/terraform/vault/github-actions/envs/k3s/main.tf
      Note: Terraform GitHub Actions role authority
    - Path: repo://Dockerfile
      Note: Container implementation and clean-build failure/fix
    - Path: repo://src/lib/fermat.ts
      Note: Implementation evidence for Fermat-style path planning
    - Path: repo://ttmp/2026/08/01/MILL-05--production-deployment-of-abs-bicolor-v-engraver-to-cam-yolo-scapegoat-dev/sources/01-connected-fermat-spirals-project.md
      Note: Defuddle-archived primary CFS project page
ExternalSources:
    - https://haisenzhao.github.io/CFS/index.html
    - https://docs.opencv.org/4.13.0/d7/d4d/tutorial_py_thresholding.html
    - https://bioimagebook.github.io/chapters/2-processing/5-morph/morph.html
    - https://theoryofcomputing.org/articles/v008a019/
    - https://rstudio-pubs-static.s3.amazonaws.com/302782_e337cfbc5ad24922bae96ca5977f4da8.html
    - https://en.wikipedia.org/wiki/Ramer%E2%80%93Douglas%E2%80%93Peucker_algorithm
    - https://github.com/gnea/grbl/blob/master/doc/markdown/commands.md
    - https://docs.vectric.com/docs/V12.0/VCarveDesktop/ENU/Help/form/VCarve%20Toolpath%20Creator/
Summary: Chronological evidence for the MILL-05 production deployment, algorithm research, implementation, validation, and delivery.
LastUpdated: 2026-08-01T14:35:00-04:00
WhatFor: Continue or review the production deployment work without reconstructing the investigation.
WhenToUse: Read before resuming MILL-05 or changing its deployment and algorithm contracts.
---


# Investigation Diary

## Goal

Deploy the browser-only ABS Bicolor V-Engraver as `https://cam.yolo.scapegoat.dev`, preserve the existing image-to-toolpath behavior, archive algorithm research for an intern, and leave a reproducible GitOps release path with reviewable commits.

## Step 1: Create the ticket and gather algorithm evidence

The first step established the ticket workspace and mapped the current application before changing code. The application is a Vite/TypeScript static SPA with the algorithmic pipeline already implemented in `src/lib/imaging.ts`, `src/lib/pipeline.ts`, `src/lib/toolpath.ts`, `src/lib/fermat.ts`, and `src/lib/operations.ts`. Its tests already covered 18 geometry and G-code invariants, so this ticket could focus on production delivery without pretending that deployment itself validates cutting safety.

Web research was organized around the algorithms that an intern must understand: Otsu thresholding, mathematical morphology, distance transforms, Zhang-Suen thinning, Ramer-Douglas-Peucker simplification, Connected Fermat Spirals, V-carving geometry, and the GRBL command dialect. Defuddle extracts were written under the ticket `sources/` directory, with URL records retained when a PDF or source page could not be extracted as HTML.

### Prompt Context

**User prompt (verbatim):** "create a new docmgr ticket for setting this up. the domain name is cam.yolo.scapegoat.dev . 

Create a new ticket, make sure to research the algorithms on the web and store interesting resources using defuddle in the sources/ directory of th enew ticket. Create  a detailed analysis / design /     
implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api          
references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.                                                                                   
                                                                                                                                                                                                            
                                                                                                                                                                                                            
then implement the new ticket, keeping a detailed diary, committing at appropriate intervals"

**Assistant interpretation:** Create MILL-05, research and archive the CAM algorithms with Defuddle, write an intern-oriented design and implementation guide, implement the production deployment path, keep this diary, commit in focused intervals, and upload the deliverables to reMarkable.

**Inferred user intent:** Make the current CAM application reachable at the supplied production hostname through the existing Go-Go-Golems release and GitOps platform, while preserving enough technical context that a new engineer can safely maintain both algorithms and operations.

**Commit (code):** N/A for this step.

### What I did

- Inspected the current source repository, package scripts, existing tests, generated G-code fixtures, and algorithm modules.
- Confirmed the current checkout is `go-go-golems/go-go-cam` and the requested hostname is `cam.yolo.scapegoat.dev`.
- Ran `docmgr status --summary-only` and confirmed MILL-01 through MILL-04 already exist.
- Attempted ticket creation with an obsolete command spelling/argument shape:

  ```text
  docmgr ticket create-ticket --ticket MILL-05 --title "Production deployment of ABS Bicolor V-Engraver to cam.yolo.scapegoat.dev" --topics cnc,frontend,deployment,gitops,kubernetes, research,toolpath-generation
  ```

  It failed with:

  ```text
  Too many arguments
  ```

- Re-ran the current CLI form successfully:

  ```text
  docmgr ticket create --ticket MILL-05 --title "Production deployment of ABS Bicolor V-Engraver to cam.yolo.scapegoat.dev" --topics cnc,frontend,deployment,gitops,kubernetes,research,toolpath-generation
  ```

- Added the design document, diary, and five implementation/delivery tasks.
- Searched for primary and explanatory resources covering all major algorithms.
- Used `defuddle parse <url> --md` and saved wrapped Markdown extracts under:
  `ttmp/2026/08/01/MILL-05--production-deployment-of-abs-bicolor-v-engraver-to-cam-yolo-scapegoat-dev/sources/`.
- Archived the Connected Fermat Spirals project page, OpenCV thresholding, mathematical morphology, distance-transform material, Zhang-Suen thinning explanation, RDP, GRBL, and V-carve references.

### Why

- The ticket needs to be the durable entry point for both a deployment and a future algorithm maintainer.
- The current app is algorithmically nontrivial; an intern needs the distinction between exact algorithms from the literature and the approximations/adaptations actually implemented here.
- The platform's deployment behavior is spread across source, GitOps, Terraform, and Vault repositories, so an orchestration document prevents a locally correct but operationally incomplete change.

### What worked

- The existing test suite was healthy: 2 files and 18 tests passed.
- The existing production build was healthy before deployment changes.
- The source checkout already had a Git remote: `git@github.com:go-go-golems/go-go-cam.git`.
- The existing Terraform wildcard `*.yolo.scapegoat.dev` covers `cam.yolo.scapegoat.dev`, so no duplicate DNS record is required.
- Defuddle successfully extracted the HTML resources and produced readable Markdown.

### What didn't work

- The first `docmgr ticket create-ticket` invocation failed because this installation expects `docmgr ticket create` and treats the space after `kubernetes,` as an extra argument.
- Defuddle cannot extract PDF content directly when the response is `application/pdf`, and ACM/ScienceDirect returned extraction errors. The ticket retains URL records and adds HTML/explanatory alternatives where possible. The exact errors were:

  ```text
  Error: Not an HTML page (content-type: application/pdf)
  Error: Not an HTML page (content-type: application/pdf)
  Error: Failed to fetch: 403 Forbidden
  ```

### What I learned

- The current source repository is not the generated directory name; its remote is `go-go-golems/go-go-cam`. Deployment image coordinates and GitHub Actions Vault claims must use the remote repository identity.
- The current implementation uses a two-pass chamfer distance field, not the exact Felzenszwalb-Huttenlocher Euclidean distance transform.
- The Fermat strategy is a distance-ring/loop-forest adaptation of Connected Fermat Spirals, not a claim of full paper-equivalent decomposition.
- The first k3s Application needs explicit live bootstrap; merging a new Application manifest does not cause Argo to create it automatically on this cluster.

### What was tricky to build

- The main research difficulty was preserving useful sources when primary papers were PDFs that Defuddle deliberately refuses to parse. I recorded the canonical URLs, retained successful project/HTML explanations, and documented the extraction limitation instead of silently substituting an uncited summary.
- The deployment difficulty was separating the application algorithm pipeline from the release control plane. The design document treats browser geometry, image publishing, GitOps desired state, Vault values, DNS, and cluster health as separate contracts.

### What warrants a second pair of eyes

- Whether `cam` is the final production application identity and whether the private GHCR pull Secret should be mandatory.
- Whether the exact `cam-gitops-pr` Vault credential path has been seeded and whether its role claim matches `go-go-golems/go-go-cam`.
- Whether the current chamfer approximation and Fermat adaptation are acceptable for the target Makera machine and ABS stock.

### What should be done in the future

- Add a browser smoke test and a container UID/health test.
- Add property-based legal-region and maximum-depth tests.
- Consider pinning the shared `infra-tooling` workflow to a reviewed commit instead of `@main`.
- Add machine-profile configuration once a second sender/controller must be supported.

### Code review instructions

- Start with `src/lib/pipeline.ts`, `src/lib/imaging.ts`, `src/lib/fermat.ts`, `src/lib/operations.ts`, and the new design document.
- Check that the design distinguishes implementation facts from literature claims.
- Validate with `pnpm test` and `pnpm build`.

### Technical details

- Ticket: `MILL-05`.
- Ticket root: `ttmp/2026/08/01/MILL-05--production-deployment-of-abs-bicolor-v-engraver-to-cam-yolo-scapegoat-dev/`.
- Source archive: `sources/01-*` through `sources/10-*`.
- Canonical CFS resource: `https://haisenzhao.github.io/CFS/index.html`.

## Step 2: Implement the source production artifact and release handoff

The first implementation interval added a reproducible static container and the source-to-GitOps release contract. The container builds the Vite bundle in a Node/pnpm stage and serves only `dist/` from Nginx. Nginx has a deterministic `/healthz` response, static fallback behavior, and restrictive browser headers. The GitHub Actions caller disables the reusable workflow's Go setup, installs the locked pnpm graph, runs Vitest, publishes the GHCR image, and opens a GitOps PR using GitHub App credentials.

A clean Docker build exposed a dependency-manager reproducibility issue: without a `packageManager` field, Corepack selected pnpm 11 and the install failed on ignored build scripts. Adding `"packageManager": "pnpm@10.13.1"` made the build deterministic and successful. This is recorded as an implementation fix rather than hidden as a transient local environment detail.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Implement the source-repository portion of the deployment ticket, keeping the release reproducible and validating it in a clean container.

**Inferred user intent:** Ensure a future `main` push can produce the exact static artifact that the k3s GitOps package expects.

**Commit (code):** `0a11e150e99976234de4aa34bc14ffb8c616c4c2` — "Add production container and GHCR deployment workflow"

### What I did

- Added `/home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/Dockerfile`.
- Added `/home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/nginx.conf`.
- Added `/home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/.dockerignore`.
- Added `.github/workflows/publish-image.yaml` using the shared `publish-ghcr-image.yml` workflow.
- Added `deploy/gitops-targets.json` pointing at `gitops/kustomize/cam/deployment.yaml` and container `cam`.
- Added `packageManager: pnpm@10.13.1` to `package.json`.
- Ran the source tests and production build.
- Ran `docker build --no-cache -t cam:mill-05 .`.

### Why

- Nginx is sufficient for a browser-only Vite bundle and avoids shipping a development server.
- A health endpoint gives Kubernetes a concrete readiness/liveness contract.
- The shared workflow preserves the platform's GHCR → GitOps PR → Argo chain.
- The package-manager pin prevents Corepack from silently changing the dependency installation behavior in CI.

### What worked

- `pnpm test`: 2 files passed, 18 tests passed.
- `pnpm build`: TypeScript check and Vite production build passed.
- The initial container build failed in a useful way, then the package-manager pin fixed it.
- The clean container build completed and produced the `cam:mill-05` image.

### What didn't work

The first clean Docker build used Corepack's default pnpm version and failed:

```text
RUN corepack enable && pnpm install --frozen-lockfile
...
! Corepack is about to download https://registry.npmjs.org/pnpm/-/pnpm-11.18.0.tgz
...
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild@0.25.12, esbuild@0.28.1
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
ERROR: process "/bin/sh -c corepack enable && pnpm install --frozen-lockfile" did not complete successfully: exit code: 1
```

Adding `packageManager: pnpm@10.13.1` caused Corepack to use the repository's known local version and the subsequent build passed. pnpm still emitted a warning about ignored `esbuild` build scripts, but Vite built successfully and the image completed.

### What I learned

- A lockfile alone does not pin the package-manager implementation; `packageManager` is part of the production build contract.
- The reusable image workflow's `setup_go` input must be explicitly disabled for this TypeScript repository.
- The source repository's actual GitHub identity is `go-go-golems/go-go-cam`; the GitOps image should therefore be `ghcr.io/go-go-golems/go-go-cam`, not a path derived from the local directory name.

### What was tricky to build

- The workflow is reusable and assumes Go setup by default. The correct TypeScript adaptation is to set `setup_go: false` while using the `test_command` input to bootstrap pnpm and run Vitest.
- The first deployment metadata draft used an assumed `wesen/cam` identity before inspecting the Git remote. It was corrected to the actual `go-go-golems/go-go-cam` image and GitHub Actions claim before cluster validation.

### What warrants a second pair of eyes

- The GitHub App Vault path `kv/data/ci/github/cam/gitops-pr-app` must exist and contain the approved App credentials.
- The `cam-gitops-pr` role must bind `repository_owner=go-go-golems` and `repository=go-go-golems/go-go-cam`.
- The Nginx runtime UID and writable memory mounts should be checked against the exact base image digest used by CI.

### What should be done in the future

- Pin the Node and Nginx base images by reviewed digest once the release registry policy requires it.
- Decide whether to allow the esbuild lifecycle script explicitly in the pnpm policy or keep the current successful no-script build behavior.
- Pin `infra-tooling` to a reviewed commit after the first production rollout.

### Code review instructions

- Start with `Dockerfile`, `nginx.conf`, `.github/workflows/publish-image.yaml`, `deploy/gitops-targets.json`, and `package.json`.
- Run:

  ```bash
  pnpm test
  pnpm build
  docker build --no-cache -t cam:review .
  docker run --rm -p 8080:80 cam:review
  curl -fsS http://127.0.0.1:8080/healthz
  ```

- Confirm the workflow passes `setup_go: false`, uses GitHub App mode, and has `id-token: write` permission.

### Technical details

- Source commit: `0a11e150e99976234de4aa34bc14ffb8c616c4c2`.
- Local image validation tag: `cam:mill-05`.
- Expected GHCR image: `ghcr.io/go-go-golems/go-go-cam:sha-<7-char-commit>`.
- Expected public URL: `https://cam.yolo.scapegoat.dev`.

## Step 3: Add the k3s GitOps package and Vault contracts

The cluster-side implementation adds a dedicated `cam` namespace and production Argo Application. The package contains a non-root Nginx Deployment, ClusterIP Service, Traefik/cert-manager Ingress, restrictive NetworkPolicy, and VSO image-pull projection. The AppProject destination is extended to permit the namespace. Vault policy and role declarations are added for both the Pod's image-pull path and the source workflow's GitHub App credential path.

The DNS Terraform repository already declares the `*.yolo.scapegoat.dev` wildcard A record to the k3s ingress, so this ticket does not add a duplicate `cam` record. The wildcard must still be verified before applying the Application.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Implement the cluster-side desired state and secret boundaries needed to serve the committed source image at the requested hostname.

**Inferred user intent:** Make the production rollout reviewable and repeatable through the existing Argo/Vault platform instead of relying on manual `kubectl set image` operations.

**Commit (code):** Pending repository-specific commits; the k3s working tree is on an existing `hotfix/datalab-rollback` branch and has unrelated changes, so changes must be committed selectively or moved to a dedicated branch before handoff.

### What I did

- Added `/home/manuel/code/wesen/2026-03-27--hetzner-k3s/gitops/kustomize/cam/`:
  `namespace.yaml`, `serviceaccount.yaml`, `vault-connection.yaml`, `vault-auth.yaml`, `vault-static-secret-image-pull.yaml`, `deployment.yaml`, `service.yaml`, `ingress.yaml`, `network-policy.yaml`, and `kustomization.yaml`.
- Added `/home/manuel/code/wesen/2026-03-27--hetzner-k3s/gitops/applications/cam.yaml`.
- Added the `cam` namespace destination to `gitops/projects/prod-apps.yaml`.
- Added `vault/policies/kubernetes/cam.hcl` and `vault/roles/kubernetes/cam.json`.
- Added `vault/policies/github-actions/cam-gitops-pr.hcl` and `vault/roles/github-actions/cam-gitops-pr.json`.
- Corrected the Deployment image and JWT role identity to the actual source repository `go-go-golems/go-go-cam`.

### Why

- A static application still needs an Argo Application, a namespace, ingress, and a workload health contract.
- The image-pull path stays isolated to `kv/apps/cam/prod/image-pull`; no application runtime secret is invented for a browser-only app.
- The NetworkPolicy makes the static workload's true dependency set explicit: Traefik ingress and cluster DNS only.

### What worked

- The package follows the cluster's documented sync-wave convention.
- The existing Traefik and CoreDNS label conventions were found in neighboring NetworkPolicies and used for the new package.
- The existing wildcard DNS record was found in Terraform, avoiding an unnecessary record.

### What didn't work

- No cluster commit has been made yet because the k3s checkout is on `hotfix/datalab-rollback` and contains unrelated untracked ticket material. The correct next action is to preserve those changes and commit only the MILL-05 paths on an appropriate branch.
- Terraform's GitHub Actions role map is a second authority for GitHub Actions roles. It still needs a selective `cam` entry or an explicit decision to use the k3s declaration/script authority only.

### What I learned

- The platform's `prod-apps` AppProject has an explicit namespace allowlist; adding an Application without adding `cam` would produce `Unknown/Unknown` or an invalid destination condition.
- The first live Application must still be applied explicitly because this cluster has no ApplicationSet/app-of-apps controller watching `gitops/applications/`.
- `imagePullSecrets` belong on the ServiceAccount so Deployments and future hook Pods inherit the pull contract consistently.

### What was tricky to build

- The current cluster repo contains active work unrelated to MILL-05. The safe commit procedure must avoid staging the user's existing changes, especially the unrelated Terraform variable edit and k3s ticket files.
- A non-root Nginx container needs writable `/var/run`, cache, and temporary locations. The Deployment therefore mounts memory-backed `emptyDir` volumes while keeping the document root read-only.

### What warrants a second pair of eyes

- Validate the Nginx image's UID 101 assumption against the production base-image digest.
- Validate the NetworkPolicy against the live Traefik Service labels and CNI enforcement.
- Confirm whether `prod-apps` is the desired AppProject for this public static utility or whether a separate static-site project should be expanded to support a per-app namespace.
- Review the GitHub Actions role duplication between JSON declarations and Terraform before applying either.

### What should be done in the future

- Add a dedicated `cam` entry to Terraform's `local.gitops_pr_roles` map without committing unrelated Terraform work.
- Seed and validate the two Vault records using non-printing procedures.
- Add a deployment smoke test that checks exact host, certificate, content type, and health endpoint.

### Code review instructions

- Start at `gitops/applications/cam.yaml`, then read the `gitops/kustomize/cam/` package in wave order.
- Check `deployment.yaml` image/name/selector agreement and the `cam-tls` host.
- Check the Vault policy and role bindings against the ServiceAccount and namespace.
- Run `bash scripts/validate_gitops.sh` and `kubectl kustomize gitops/kustomize/cam`.

### Technical details

- Cluster repository: `/home/manuel/code/wesen/2026-03-27--hetzner-k3s`.
- Application: `cam`.
- Namespace: `cam`.
- Host: `cam.yolo.scapegoat.dev`.
- Source image: `ghcr.io/go-go-golems/go-go-cam:sha-<7-char-commit>`.
- Runtime secret path: `kv/apps/cam/prod/image-pull`.
- CI credential path: `kv/data/ci/github/cam/gitops-pr-app`.
