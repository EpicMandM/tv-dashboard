---
name: ai-maintainability
description: Optimizes this fully AI-managed Tizen TV dashboard for long-term AI maintainability by simplifying, consolidating, and removing unnecessary complexity. Use when performing repository-wide maintenance, refactoring, cleanup, architecture work, or changing the widget, Vite/Tizen build, host API client, mock API, or deploy scripts.
---

# AI maintainability

Optimize aggressively for long-term **AI maintainability**. Leave the repository simpler, more consistent, and easier for future agents to understand than you found it.

This repo is a **Tizen 5.5 / Chromium 69 widget**, not a homelab, backend, or general web app. Keep it a thin remote-driven client of a host API.

## Principles

- Proactively simplify, refactor, consolidate, and remove unnecessary complexity when the change is in scope.
- Prefer explicit, deterministic patterns over implicit, clever, or ad-hoc ones.
- Aggressively eliminate duplication, dead code, stale configuration, obsolete compatibility layers, and unnecessary indirection when safe.
- Keep naming, structure, configuration, and conventions consistent with the rest of the repository.
- Minimize dependencies, files, concepts, special cases, and overall maintenance surface. Prefer extending an existing file over adding a module.
- Keep README and inline contracts useful as context for future AI agents; update them when the API, build, or deploy path changes.
- Do not preserve bad historical patterns merely to keep diffs small.
- Preserve Chromium 69 compatibility, the host API contract, remote UX, and deployability. Simplification must not sacrifice these.

## This repository

- **Runtime**: Tizen 5.5, Chromium 69. Vite build target chrome69 / ES2018. Vite build is IIFE `app.js` + classic `<script>`, `base: './'`. Do not introduce ESM-in-browser, `type="module"`, or CSS the TV cannot parse (`:where()` is stripped at build; do not rely on it).
- **Source style**: write JS the TV can run after the chrome69 transpile. Avoid optional chaining and other syntax the existing code already spells out with `&&` / `indexOf` / classic `function`. Keep the `src/lib/polyfills.js` shims (`globalThis`, `queueMicrotask`, `replaceAll`) unless the need is gone.
- **Shape**: one 1920×1080 D-pad screen (`src/app.js` + `src/lib/tv.js` + `src/app.css`). Host JSON drives copy and buttons. No UI framework, router, store library, or CSS framework.
- **Host contract**: `GET /tv` = screen. `POST /actions/:id` → 204. `home` = back. Cached `plan-tomorrow` / `what-missed` switch the view; else the host writes `running` then the result. `VITE_API_BASE_URL` empty = Vite mock from `data/tv.json`; TV builds use `.env.production`. Payload limits live in `isDashboard` — do not silently widen them.
- **Deploy**: `scripts/tv.js` packages a signed `.wgt` and talks to the TV via `sdb`. `scripts/vendor/` is Tizen signing — treat as frozen. Do not add a second packaging path.
- **Out of scope here**: Home Assistant, host `:8787` implementation, LLM planning, and other repos. Do not grow a backend into this widget.

## When changing code

1. Match the local pattern (vanilla JS DOM in `src/app.js`, Russian user-facing copy, 2-column remote grid).
2. Delete what the change makes unused (dead actions, mock branches, CSS, env).
3. Do not add Python quality gates, IaC, or homelab conventions. This repo is Bun + Vite + Tizen.
4. After a code change, `bun run build` must succeed. That is the TV artifact check.
