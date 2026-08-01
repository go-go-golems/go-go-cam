# Changelog

## 2026-08-01

- Initial workspace created


## 2026-08-01

Step 1: Created MILL-05, archived algorithm research with Defuddle, and wrote the intern-oriented design guide.

### Related Files

- /home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/ttmp/2026/08/01/MILL-05--production-deployment-of-abs-bicolor-v-engraver-to-cam-yolo-scapegoat-dev/design-doc/01-production-deployment-design-and-implementation-guide.md — Primary design and research synthesis


## 2026-08-01

Step 2: Added production Docker/Nginx image and GHCR/GitOps workflow (commit 0a11e150e99976234de4aa34bc14ffb8c616c4c2).

### Related Files

- /home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/Dockerfile — Two-stage production image


## 2026-08-01

Step 3: Added CAM k3s package, Argo Application, Vault contracts, and AppProject namespace allowlist (commit 90433941ef752a7649fa6284bb851f91bb2f87b8).

### Related Files

- /home/manuel/code/wesen/2026-03-27--hetzner-k3s/gitops/applications/cam.yaml — Production Argo Application


## 2026-08-01

Step 4: Added the Terraform GitHub Actions role map entry (commit 828ec7b3b5ff6bad0fae8dd1ae8f60d722265b61), preserving unrelated local Terraform work.

### Related Files

- /home/manuel/code/wesen/terraform/vault/github-actions/envs/k3s/main.tf — Terraform role authority


## 2026-08-01

Step 4: Rendered cam, passed cluster validation (51 packages, 0 violations), passed docmgr doctor, and preserved remaining live rollout/upload work.

### Related Files

- /home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/ttmp/2026/08/01/MILL-05--production-deployment-of-abs-bicolor-v-engraver-to-cam-yolo-scapegoat-dev/reference/01-investigation-diary.md — Validation evidence and remaining gates


## 2026-08-01

Step 5: Refactored CAM from a bespoke Nginx Deployment to the shared Vite static-sites publisher pipeline (source 9c7aff7, k3s f0b538e).

### Related Files

- /home/manuel/code/wesen/2026-03-27--hetzner-k3s/gitops/kustomize/cam/publish-job.yaml — Shared static-sites publisher Job
- /home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/Dockerfile.static — Static /site artifact contract


## 2026-08-01

Step 6: Selected public GHCR for CAM and removed runtime image-pull Vault/VSO wiring; retained Vault only for the CI GitHub App credential.

### Related Files

- /home/manuel/code/wesen/2026-03-27--hetzner-k3s/gitops/kustomize/cam/kustomization.yaml — Public artifact publisher package without runtime Vault resources
- /home/manuel/code/wesen/2026-07-31--cat-mill-roam-fable/Dockerfile.static — Public Vite artifact contents


## 2026-08-01

Step 7: Completed live rollout at cam.yolo.scapegoat.dev using public GHCR image sha-2b00365; Argo is Synced/Healthy, publisher Job completed, certificate is Ready, and HTTPS returns 200.

### Related Files

- /home/manuel/code/wesen/2026-03-27--hetzner-k3s/gitops/applications/cam.yaml — Initial Argo Application bootstrap
- /home/manuel/code/wesen/2026-03-27--hetzner-k3s/gitops/kustomize/cam/publish-job.yaml — Completed public publisher Job

