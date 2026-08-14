# anti-slop (vendored)

Opinionated Oxlint rules that reject low-evidence TypeScript and JavaScript patterns.

Upstream: https://github.com/dmmulroy/anti-slop (MIT)

This copy is maintained in-repo. Update from upstream when needed; adjust rules in
`vite.config.ts` to match Noyau conventions.

Oxlint loads `index.js` (bundled entry point). After editing the TypeScript sources,
rebuild with:

```bash
bun build tools/oxlint/anti-slop/index.ts --outfile tools/oxlint/anti-slop/index.js --target node --format esm
```
