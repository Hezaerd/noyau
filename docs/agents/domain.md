# Domain Docs

How engineering skills consume this repo's domain documentation.

## Before exploring, read these

- `CONTEXT-MAP.md` at the repo root.
- The relevant `CONTEXT.md` for the app or package being modified.
- `docs/adr/` for system-wide decisions.
- `<context>/docs/adr/` for context-specific decisions.

If these files don't exist, proceed silently. The domain-modeling skills create them lazily when terms or decisions are resolved.

## File structure

```text
/
├── CONTEXT-MAP.md
├── docs/adr/                         ← system-wide decisions
├── apps/
│   └── <app>/
│       ├── CONTEXT.md
│       └── docs/adr/                 ← app-specific decisions
└── packages/
    └── <package>/
        ├── CONTEXT.md
        └── docs/adr/                 ← package-specific decisions
```

## Use the glossary's vocabulary

When output names a domain concept, use the term defined in the relevant `CONTEXT.md`.

If the concept isn't documented yet, note the gap for `/domain-modeling`.

## Flag ADR conflicts

If output contradicts an existing ADR, surface it explicitly instead of silently overriding it.
