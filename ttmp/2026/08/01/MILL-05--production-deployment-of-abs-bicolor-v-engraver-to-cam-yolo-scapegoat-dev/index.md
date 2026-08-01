---
Title: Production deployment of ABS Bicolor V-Engraver to cam.yolo.scapegoat.dev
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
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Deploy the browser-only ABS Bicolor V-Engraver to cam.yolo.scapegoat.dev through a public GHCR artifact, GitHub App-backed GitOps, Argo CD, and k3s, with algorithm research and intern-ready implementation documentation."
LastUpdated: 2026-08-01T14:40:00-04:00
WhatFor: ""
WhenToUse: ""
---

# Production deployment of ABS Bicolor V-Engraver to cam.yolo.scapegoat.dev

## Overview

MILL-05 packages the production delivery of the Vite/TypeScript ABS Bicolor V-Engraver from the `go-go-golems/go-go-cam` source repository to `https://cam.yolo.scapegoat.dev`. The ticket contains an intern-oriented algorithm and deployment guide, Defuddle-archived research under `sources/`, a chronological diary, source-repository release files, and the k3s GitOps contract. The public GHCR artifact removes runtime Vault/VSO dependencies; Vault remains only for the CI GitHub App credential.

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **active**

## Topics

- cnc
- frontend
- deployment
- gitops
- kubernetes
- research
- toolpath-generation

## Tasks

See [tasks.md](./tasks.md) for the current task list.

## Changelog

See [changelog.md](./changelog.md) for recent changes and decisions.

## Structure

- design/ - Architecture and design documents
- reference/ - Prompt packs, API contracts, context summaries
- playbooks/ - Command sequences and test procedures
- scripts/ - Temporary code and tooling
- various/ - Working notes and research
- archive/ - Deprecated or reference-only artifacts
