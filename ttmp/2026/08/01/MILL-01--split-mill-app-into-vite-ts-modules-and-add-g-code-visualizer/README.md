# Split mill app into Vite/TS modules and add G-code visualizer

This is the document workspace for ticket MILL-01.

## Structure

- **design/**: Design documents and architecture notes
- **reference/**: Reference documentation and API contracts
- **playbooks/**: Operational playbooks and procedures
- **scripts/**: Utility scripts and automation
- **sources/**: External sources and imported documents
- **various/**: Scratch or meeting notes, working notes
- **archive/**: Optional space for deprecated or reference-only artifacts

## Getting Started

Use docmgr commands to manage this workspace:

- Add documents: `docmgr doc add --ticket MILL-01 --doc-type design-doc --title "My Design"`
- Import sources: `docmgr import file --ticket MILL-01 --file /path/to/doc.md`
- Update metadata: `docmgr meta update --ticket MILL-01 --field Status --value review`
