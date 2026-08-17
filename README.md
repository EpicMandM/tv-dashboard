# TV Dashboard — Tizen 5.5 / Chromium 69

```bash
bun install
bun run dev       # http://localhost:5173  mock = data/tv.json
bun run deploy    # build, sign, install, launch
bun run package   # signed .wgt
bun run launch
```

GET `/tv` = screen. POST `/actions/:id` → 204. `home` = back. Cached `plan-tomorrow` / `what-missed` switch the view; else host writes `running` then the result.

`VITE_API_BASE_URL` empty = mock. TV build: `.env.production` → `http://HOST:8787`.

`TV_IP` required. Optional: `SDB`, `CERT_DIR`, `CERT_PASSWORD_FILE`.

Power-on: Home Assistant `script.bedroom_tv_on` POSTs `http://127.0.0.1:8787/launch` after IR on. `tv-snapshot` waits until the TV is actually on, then launches the widget (`sdb was_execute`, HTTP, websocket) until it is visible. `bun run watch` is a host-side fallback.
