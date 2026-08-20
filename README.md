# TV Dashboard — Tizen 5.5 / Chromium 69

```bash
bun install
bun run dev       # Vite mock from data/tv.json
bun run lint      # Oxlint
bun run build     # TV artifact check
bun run deploy    # build, sign, install, launch
bun run package   # signed .wgt
bun run launch
bun run watch
```

GET `/tv` = screen. POST `/actions/:id` → 204. `home` = back.

Empty `VITE_API_BASE_URL` = Vite mock from `data/tv.json`. TV **build** needs `.env.production` with `VITE_API_BASE_URL=http://HOST:8787` or the widget will talk to itself. `TV_IP` lives in `.env` (used by `scripts/tv.js`). Optional `SDB`, `CERT_DIR`, `CERT_PASSWORD_FILE`. Package needs `sdb` + `zip` + Samsung p12 certs.

Host `:8787` and Home Assistant power-on live in other repos.
