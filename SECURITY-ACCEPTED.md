# Accepted security advisories

These advisories are listed in `package.json` → `pnpm.auditConfig.ignoreGhsas`
so `pnpm audit` stays clean. Each is genuinely unfixable without breaking the
build or removing a kept feature, or is non-exploitable in this app. Revisit
when upstream patches land.

| GHSA | Pkg | Sev | Why accepted |
|------|-----|-----|--------------|
| GHSA-848j-6mx2-7j84 | elliptic | low | No patch published (`patched: <0.0.0`). Transitive browser polyfill (`crypto-browserify`). |
| GHSA-rmmh-p597-ppvv | showdown | mod | No patch published. ReDoS in markdown rendering; swapping to another lib is a core-renderer refactor with regression risk. |
| GHSA-w5hq-g745-h8pq | uuid | mod | Non-exploitable: advisory affects `v3/v5/v6` with a `buf` arg; this app uses only `v4`. The fix (uuid v11) is ESM-only and breaks the CommonJS server build. |
| GHSA-4w7w-66w2-5vf9 | vite | mod | Dev-server only (optimized-deps `.map` path traversal). Patched in Vite 6, which breaks `vite-plugin-node-polyfills` (build verified to fail). Dev server is not exposed in prod. |
| GHSA-v6wh-96g9-6wx3 | vite | mod | Windows-only (launch-editor UNC NTLM). Prod runs Linux. Fix requires Vite 6 (breaks build). |
| GHSA-fx2h-pf6j-xcff | vite | high | `server.fs.deny` bypass on Windows alternate paths — dev-server + Windows only; prod is Linux and the dev server isn't exposed. Fix requires Vite 6 (breaks build). |
| GHSA-wgrm-67xf-hhpq | pdfjs-dist | high | Malicious-PDF JS execution. Fix is pdfjs v4 (ESM/worker API break, entangled with `pdfdataextract`). Exploit is self-inflicted — a user importing their **own** PDF for text extraction into their **own** library; no cross-user vector. |
| GHSA-8fgc-7cc6-rx7x | webpack | low | Transitive **peer** dep of `worker-loader` under `pdfjs-dist`; `pnpm.overrides` don't apply to peer resolution. Tied to the pdfjs-dist item above. |
| GHSA-38r7-794h-5758 | webpack | low | Same as above. |

All 6 criticals and 59 of 61 highs were eliminated by removals + overrides + bumps
(audit went 154 → 0 active). See `pnpm.overrides` in `package.json`.
